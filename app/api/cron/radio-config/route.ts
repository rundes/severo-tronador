// GET: devuelve los programas de radio "al aire ahora" (todos los proyectos),
// con su duración y keywords, para que el runner de GitHub Actions sepa qué
// grabar. La lógica de franja horaria vive acá (testeable). Seguro con CRON_SECRET.
import { NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/crypto";
import { dbConfigured } from "@/lib/db/supabase";
import { listActiveProjects } from "@/lib/projects";
import { getListeningConfig } from "@/lib/listening-config";
import { programsToRecord, secondsUntilEnd, hhmmToMinutes } from "@/lib/radio";
import { createRunIfAbsent } from "@/lib/radio-runs";

// Pre-roll (min): se empieza a grabar hasta LEAD_MIN antes del inicio para no
// perder el arranque del programa (la radio en vivo no tiene rewind). El cron
// corre cada 15 min → siempre cae un tick en [inicio - LEAD_MIN, inicio).
const LEAD_MIN = 15;

// Argentina = UTC-3 fijo (sin DST).
const AR_OFFSET_MIN = -180;

function authOk(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) return constantTimeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`);
  return process.env.NODE_ENV !== "production";
}

export async function GET(req: Request) {
  if (!authOk(req)) return new Response("Forbidden", { status: 403 });
  if (!dbConfigured()) return NextResponse.json({ programs: [] });

  // "Ahora" en hora argentina.
  const ar = new Date(Date.now() + AR_OFFSET_MIN * 60_000);
  const dayOfWeek = ar.getUTCDay();
  const minutesOfDay = ar.getUTCHours() * 60 + ar.getUTCMinutes();
  const yyyy = ar.getUTCFullYear();
  const mm = String(ar.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(ar.getUTCDate()).padStart(2, "0");

  const projects = await listActiveProjects();
  const scheduledDate = `${yyyy}-${mm}-${dd}`;
  const out: Array<{
    projectId: string;
    runId: string;
    station: string;
    programa: string;
    url: string;
    durationSec: number;
    isoStart: string;
    keywords: string[];
  }> = [];

  for (const p of projects) {
    const cfg = await getListeningConfig(p.id);
    if (!cfg.radioStreams?.length) continue;
    const toRec = programsToRecord(cfg.radioStreams, dayOfWeek, minutesOfDay, LEAD_MIN);
    for (const prog of toRec) {
      // isoStart = hoy a la hora de inicio del programa (AR) en UTC.
      const startMin = hhmmToMinutes(prog.start);
      const startUtcMs =
        Date.UTC(yyyy, ar.getUTCMonth(), ar.getUTCDate(), 0, 0, 0) +
        startMin * 60_000 -
        AR_OFFSET_MIN * 60_000;
      const isoStart = new Date(startUtcMs).toISOString();
      // Dedup: crea el run del programa-día; si ya existe, no re-grabar.
      const run = await createRunIfAbsent({
        projectId: p.id,
        station: prog.station,
        programa: prog.programa,
        scheduledDate,
        scheduledStart: isoStart,
      });
      if (!run) continue;
      out.push({
        projectId: p.id,
        runId: run.id,
        station: prog.station,
        programa: prog.programa,
        url: prog.url,
        // Graba desde ahora (con pre-roll) hasta el fin del programa.
        durationSec: secondsUntilEnd(prog, minutesOfDay),
        isoStart,
        keywords: cfg.keywords,
      });
    }
  }
  return NextResponse.json({ programs: out });
}
