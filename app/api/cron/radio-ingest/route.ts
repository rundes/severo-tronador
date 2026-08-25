// POST: recibe el transcript de un programa de radio (desde el runner de
// GitHub Actions), matchea las keywords del proyecto y upserta menciones en
// listening_items (source = estación). Seguro con CRON_SECRET.
import { NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/crypto";
import { dbConfigured } from "@/lib/db/supabase";
import { getListeningConfig } from "@/lib/listening-config";
import { upsertItems } from "@/lib/listening-cache";
import { transcriptToItems, segmentsToItems } from "@/lib/radio";
import { parseJsonBody, RadioIngestSchema } from "@/lib/schemas";
import { markRunDone } from "@/lib/radio-runs";
import { log } from "@/lib/logger";

function authOk(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) return constantTimeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`);
  return process.env.NODE_ENV !== "production";
}

export async function POST(req: Request) {
  if (!authOk(req)) return new Response("Forbidden", { status: 403 });
  if (!dbConfigured()) return NextResponse.json({ skipped: "no db" });

  // El CRON_SECRET autentica el origen, no el contenido: sin validar forma, un
  // cambio de formato del runner entraba igual y explotaba adentro.
  const parsed = await parseJsonBody(req, RadioIngestSchema);
  if (!parsed.ok) return parsed.response;
  const { projectId, runId, station, programa, isoStart, transcript, segments, audioObject, durationSec, failed, status } = parsed.data;
  // La grabación/transcripción falló en el runner → marcar el run y salir.
  if (failed) {
    if (runId) await markRunDone(runId, { status: "failed" });
    return NextResponse.json({ ok: true, failed: true });
  }
  // El canal no estaba en vivo (yt-dlp no encontró stream) → marcar y salir,
  // sin matchear keywords (no hay transcript).
  if (status === "no_live") {
    if (runId) await markRunDone(runId, { status: "no_live" });
    return NextResponse.json({ ok: true, noLive: true });
  }

  const cfg = await getListeningConfig(projectId);
  // Con segments (Whisper) generamos items por-segmento con offsets para el
  // ±10s; si no, caemos al transcript plano (Gemini).
  const items =
    Array.isArray(segments) && audioObject
      ? segmentsToItems(segments, cfg.keywords, { station, programa: programa ?? "", isoStart, audioObject })
      : transcriptToItems(typeof transcript === "string" ? transcript : "", cfg.keywords, {
          station,
          programa: programa ?? "",
          isoStart,
        });
  const r = await upsertItems(
    projectId,
    "radio",
    items.map((i) => ({
      source: i.source,
      text: i.text,
      url: i.url,
      author: i.author,
      publishedAt: i.publishedAt,
      meta: i.meta,
    })),
  );
  if (runId) {
    await markRunDone(runId, { audioObject, durationSec, mentions: items.length });
  }
  log.info("radio.ingest.ok", { projectId, station, runId, found: items.length, ...r });
  return NextResponse.json({ ok: true, found: items.length, ...r });
}
