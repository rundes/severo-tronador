// POST: recibe el transcript de un programa de radio (desde el runner de
// GitHub Actions), matchea las keywords del proyecto y upserta menciones en
// listening_items (source = estación). Seguro con CRON_SECRET.
import { NextResponse } from "next/server";
import { dbConfigured } from "@/lib/db/supabase";
import { getListeningConfig } from "@/lib/listening-config";
import { upsertItems } from "@/lib/listening-cache";
import { transcriptToItems } from "@/lib/radio";
import { log } from "@/lib/logger";

function authOk(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) return req.headers.get("authorization") === `Bearer ${secret}`;
  return process.env.NODE_ENV !== "production";
}

export async function POST(req: Request) {
  if (!authOk(req)) return new Response("Forbidden", { status: 403 });
  if (!dbConfigured()) return NextResponse.json({ skipped: "no db" });

  let body: {
    projectId?: string;
    station?: string;
    programa?: string;
    isoStart?: string;
    transcript?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "json inválido" }, { status: 400 });
  }
  const { projectId, station, programa, isoStart, transcript } = body;
  if (!projectId || !station || !isoStart || typeof transcript !== "string") {
    return NextResponse.json({ ok: false, error: "campos faltantes" }, { status: 400 });
  }

  const cfg = await getListeningConfig(projectId);
  const items = transcriptToItems(transcript, cfg.keywords, {
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
    })),
  );
  log.info("radio.ingest.ok", { projectId, station, found: items.length, ...r });
  return NextResponse.json({ ok: true, found: items.length, ...r });
}
