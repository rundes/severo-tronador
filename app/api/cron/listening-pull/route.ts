// Cron horario: fetcha cada listening source y upserta en listening_items
// (Plan 05 F5). En Vercel Hobby la frecuencia se gestiona vía GitHub
// Actions (cada 1h en .github/workflows/cron.yml).
import { NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/crypto";
import { dbConfigured } from "@/lib/db/supabase";
import { pullAllSources, type PullSummary } from "@/lib/listening-cache";
import { listActiveProjects } from "@/lib/projects";
import { log } from "@/lib/logger";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (!constantTimeEqual(auth ?? "", `Bearer ${secret}`)) {
      return new Response("Forbidden", { status: 403 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return new Response("CRON_SECRET no configurado", { status: 403 });
  }
  if (!dbConfigured()) {
    return NextResponse.json({ skipped: "no db" });
  }

  const t0 = Date.now();
  try {
    // Itera todos los proyectos activos; cada uno con su config de escucha.
    const projects = await listActiveProjects();
    const byProject: Record<string, PullSummary> = {};
    let total = 0;
    for (const p of projects) {
      const summary = await pullAllSources(p.id);
      byProject[p.id] = summary;
      total += summary.total;
    }
    const ms = Date.now() - t0;
    log.info("listening.pull.ok", { total, projects: projects.length, ms });
    return NextResponse.json({ ok: true, ms, total, projects: projects.length, byProject });
  } catch (e) {
    log.error("listening.pull.failed", { error: (e as Error).message });
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
