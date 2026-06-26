// POST: recibe el transcript de un programa de radio (desde el runner de
// GitHub Actions), matchea las keywords del proyecto y upserta menciones en
// listening_items (source = estación). Seguro con CRON_SECRET.
import { NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/crypto";
import { dbConfigured } from "@/lib/db/supabase";
import { getListeningConfig } from "@/lib/listening-config";
import { upsertItems } from "@/lib/listening-cache";
import { transcriptToItems, segmentsToItems, type RadioSegment } from "@/lib/radio";
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

  let body: {
    projectId?: string;
    runId?: string;
    station?: string;
    programa?: string;
    isoStart?: string;
    transcript?: string;
    segments?: RadioSegment[];
    audioObject?: string;
    durationSec?: number;
    failed?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "json inválido" }, { status: 400 });
  }
  const { projectId, runId, station, programa, isoStart, transcript, segments, audioObject, durationSec, failed } = body;
  if (!projectId || !station || !isoStart) {
    return NextResponse.json({ ok: false, error: "campos faltantes" }, { status: 400 });
  }
  // La grabación/transcripción falló en el runner → marcar el run y salir.
  if (failed) {
    if (runId) await markRunDone(runId, { status: "failed" });
    return NextResponse.json({ ok: true, failed: true });
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
