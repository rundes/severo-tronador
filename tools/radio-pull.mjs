// Runner de ingesta de radio para GitHub Actions (no corre en Vercel).
// Flujo: pide los programas "al aire" al app, graba cada uno con ffmpeg,
// lo transcribe con Gemini (Files API) y postea el transcript al app, que
// matchea keywords y upserta menciones en listening_items.
//
// Env requeridas: APP_URL, CRON_SECRET, GOOGLE_AI_API_KEY.
// Requiere `ffmpeg` en el runner (ubuntu-latest lo tiene vía apt).
import { spawn } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";

const APP_URL = process.env.APP_URL?.replace(/\/$/, "");
const CRON_SECRET = process.env.CRON_SECRET;
const GEMINI_KEY = process.env.GOOGLE_AI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
// Tope de seguridad de grabación (segundos) para no agotar minutos de Actions.
const MAX_REC_SEC = Number(process.env.RADIO_MAX_REC_SEC || 7200);

if (!APP_URL || !CRON_SECRET || !GEMINI_KEY) {
  console.error("Faltan env: APP_URL, CRON_SECRET, GOOGLE_AI_API_KEY");
  process.exit(1);
}

const auth = { Authorization: `Bearer ${CRON_SECRET}` };

async function getPrograms() {
  const res = await fetch(`${APP_URL}/api/cron/radio-config`, { headers: auth });
  if (!res.ok) throw new Error(`radio-config ${res.status}`);
  const data = await res.json();
  return data.programs ?? [];
}

// Graba `seconds` del stream a un mp3 mono 48kbps (chico para Gemini).
function record(url, seconds, outPath) {
  return new Promise((resolve, reject) => {
    const args = ["-y", "-i", url, "-t", String(Math.min(seconds, MAX_REC_SEC)), "-ac", "1", "-ab", "48k", "-vn", outPath];
    const ff = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "inherit"] });
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve(outPath) : reject(new Error(`ffmpeg exit ${code}`))));
  });
}

// Sube el audio a la Files API de Gemini (subida simple) → file uri.
async function uploadToGemini(path, mime = "audio/mp3") {
  const bytes = await readFile(path);
  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "raw",
        "X-Goog-Upload-Content-Type": mime,
        "Content-Type": mime,
      },
      body: bytes,
    },
  );
  if (!startRes.ok) throw new Error(`gemini upload ${startRes.status}: ${await startRes.text()}`);
  const j = await startRes.json();
  return j.file?.uri ?? j.uri;
}

async function transcribe(fileUri, mime = "audio/mp3") {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: "Transcribí este audio de radio en español rioplatense. Devolvé SOLO el texto transcripto, sin comentarios." },
              { file_data: { mime_type: mime, file_uri: fileUri } },
            ],
          },
        ],
      }),
    },
  );
  if (!res.ok) throw new Error(`gemini generate ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
}

async function ingest(payload) {
  const res = await fetch(`${APP_URL}/api/cron/radio-ingest`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  console.log(`ingest ${payload.station}: ${res.status}`, await res.text());
}

async function main() {
  const programs = await getPrograms();
  if (!programs.length) {
    console.log("Sin programas al aire ahora.");
    return;
  }
  for (const p of programs) {
    const out = `/tmp/radio-${Date.now()}.mp3`;
    try {
      console.log(`Grabando ${p.station} · ${p.programa} (${p.durationSec}s)…`);
      await record(p.url, p.durationSec, out);
      const uri = await uploadToGemini(out);
      const transcript = await transcribe(uri);
      await ingest({
        projectId: p.projectId,
        station: p.station,
        programa: p.programa,
        isoStart: p.isoStart,
        transcript,
      });
    } catch (e) {
      console.error(`Falló ${p.station}:`, e.message);
    } finally {
      await unlink(out).catch(() => {});
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
