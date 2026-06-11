// Runner de ingesta de radio para GitHub Actions (no corre en Vercel).
// Flujo por programa al aire: graba con ffmpeg → transcribe con Whisper
// (whisper-ctranslate2, con timestamps por segmento) → sube el audio a GCS →
// postea {segments, audioObject} al app, que matchea keywords y upserta
// menciones (con offsets para reproducir ±10s).
//
// Env: APP_URL, CRON_SECRET, GCS_BUCKET (def maipu-pba), WHISPER_MODEL (def base).
// Requiere en el runner: ffmpeg, whisper-ctranslate2 (pip), gcloud (auth por SA).
import { spawn } from "node:child_process";
import { readFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const APP_URL = process.env.APP_URL?.replace(/\/$/, "");
const CRON_SECRET = process.env.CRON_SECRET;
const BUCKET = process.env.GCS_BUCKET || "maipu-pba";
const WHISPER_MODEL = process.env.WHISPER_MODEL || "base";
const MAX_REC_SEC = Number(process.env.RADIO_MAX_REC_SEC || 10800);

if (!APP_URL || !CRON_SECRET) {
  console.error("Faltan env: APP_URL, CRON_SECRET");
  process.exit(1);
}
const auth = { Authorization: `Bearer ${CRON_SECRET}` };

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"] });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}`))));
  });
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "radio";
}

// Solo http(s) y host público (evita SSRF/LFI vía ffmpeg).
function assertHttpUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`URL inválida: ${url}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`Protocolo no permitido: ${u.protocol}`);
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (
    host === "localhost" || host === "0.0.0.0" || host === "::1" || host === "[::1]" ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^169\.254\./.test(host)
  ) {
    throw new Error(`Host interno/privado no permitido: ${host}`);
  }
}

async function getPrograms() {
  const res = await fetch(`${APP_URL}/api/cron/radio-config`, { headers: auth });
  if (!res.ok) throw new Error(`radio-config ${res.status}`);
  return (await res.json()).programs ?? [];
}

async function record(url, seconds, outPath) {
  assertHttpUrl(url);
  await run("ffmpeg", [
    "-y", "-protocol_whitelist", "http,https,tcp,tls,crypto",
    "-i", url, "-t", String(Math.min(seconds, MAX_REC_SEC)),
    "-ac", "1", "-ab", "48k", "-vn", outPath,
  ]);
}

// Transcribe con whisper-ctranslate2 → JSON con segments [{start,end,text}].
async function transcribeWhisper(audioPath, dir) {
  await run("whisper-ctranslate2", [
    audioPath, "--model", WHISPER_MODEL, "--language", "es",
    "--task", "transcribe", "--output_format", "json", "--output_dir", dir,
  ]);
  const base = audioPath.split("/").pop().replace(/\.[^.]+$/, "");
  const raw = await readFile(join(dir, `${base}.json`), "utf8");
  const j = JSON.parse(raw);
  return (j.segments ?? []).map((s) => ({ start: s.start, end: s.end, text: s.text }));
}

async function gcsUpload(localPath, object) {
  await run("gcloud", ["storage", "cp", localPath, `gs://${BUCKET}/${object}`, "--quiet"]);
  return object;
}

async function ingest(payload) {
  const res = await fetch(`${APP_URL}/api/cron/radio-ingest`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  console.log(`ingest ${payload.station}: ${res.status}`, (await res.text()).slice(0, 300));
}

async function main() {
  const programs = await getPrograms();
  if (!programs.length) {
    console.log("Sin programas a grabar ahora.");
    return;
  }
  for (const p of programs) {
    const dir = await mkdtemp(join(tmpdir(), "radio-"));
    const out = join(dir, "audio.mp3");
    try {
      console.log(`Grabando ${p.station} · ${p.programa} (${p.durationSec}s)…`);
      await record(p.url, p.durationSec, out);
      const segments = await transcribeWhisper(out, dir);
      const object = `radios/${slug(p.station)}/${p.isoStart.replace(/[:.]/g, "-")}.mp3`;
      await gcsUpload(out, object);
      await ingest({
        projectId: p.projectId,
        runId: p.runId,
        station: p.station,
        programa: p.programa,
        isoStart: p.isoStart,
        segments,
        audioObject: object,
        durationSec: p.durationSec,
      });
    } catch (e) {
      console.error(`Falló ${p.station}:`, e.message);
      // Marca el run como fallido para que la agenda lo muestre.
      await fetch(`${APP_URL}/api/cron/radio-ingest`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: p.projectId, runId: p.runId, station: p.station,
          programa: p.programa, isoStart: p.isoStart, transcript: "", failed: true,
        }),
      }).catch(() => {});
    } finally {
      await unlink(out).catch(() => {});
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
