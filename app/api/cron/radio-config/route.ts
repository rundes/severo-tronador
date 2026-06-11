// GET: devuelve los programas de radio "al aire ahora" (todos los proyectos),
// con su duración y keywords, para que el runner de GitHub Actions sepa qué
// grabar. La lógica de franja horaria vive acá (testeable). Seguro con CRON_SECRET.
import { NextResponse } from "next/server";
import { dbConfigured } from "@/lib/db/supabase";
import { listActiveProjects } from "@/lib/projects";
import { getListeningConfig } from "@/lib/listening-config";
import { programsStartingNow, secondsUntilEnd, hhmmToMinutes } from "@/lib/radio";

// Ventana del trigger por cron (min): captura el programa una vez cerca de su
// inicio, tolerando demoras del scheduler de GitHub Actions.
const START_WINDOW_MIN = 35;

// Argentina = UTC-3 fijo (sin DST).
const AR_OFFSET_MIN = -180;

function authOk(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) return req.headers.get("authorization") === `Bearer ${secret}`;
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
  const out: Array<{
    projectId: string;
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
    const starting = programsStartingNow(cfg.radioStreams, dayOfWeek, minutesOfDay, START_WINDOW_MIN);
    for (const prog of starting) {
      // isoStart = hoy a la hora de inicio del programa (AR) en UTC.
      const startMin = hhmmToMinutes(prog.start);
      const startUtcMs =
        Date.UTC(yyyy, ar.getUTCMonth(), ar.getUTCDate(), 0, 0, 0) +
        startMin * 60_000 -
        AR_OFFSET_MIN * 60_000;
      out.push({
        projectId: p.id,
        station: prog.station,
        programa: prog.programa,
        url: prog.url,
        // Graba lo que queda del programa (tolera demora del cron).
        durationSec: secondsUntilEnd(prog, minutesOfDay),
        isoStart: new Date(startUtcMs).toISOString(),
        keywords: cfg.keywords,
      });
    }
  }
  // Marca de fecha para debugging del runner.
  void `${yyyy}-${mm}-${dd}`;
  return NextResponse.json({ programs: out });
}
