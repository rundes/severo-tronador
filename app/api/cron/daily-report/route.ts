// Cron diario: por proyecto activo, barrido con la config vigente del panel
// + informe de temas relevantes generado con Claude sobre el historial
// (items 24h/7d + informe anterior como memoria) + mail a los owners.
// Disparado por GitHub Actions (daily-report.yml) o a mano desde el panel.
import { NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/crypto";
import { dbConfigured } from "@/lib/db/supabase";
import { listActiveProjects } from "@/lib/projects";
import { generateDailyReport, emailDailyReport } from "@/lib/daily-report";
import { log } from "@/lib/logger";

export const maxDuration = 300;

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
  if (!dbConfigured()) return NextResponse.json({ skipped: "no db" });

  const t0 = Date.now();
  const byProject: Record<string, { items24h?: number; emails?: number; error?: string }> = {};
  const projects = await listActiveProjects();
  for (const p of projects) {
    try {
      const report = await generateDailyReport(p.id);
      const { sent } = await emailDailyReport(p.id, report);
      byProject[p.id] = { items24h: report.items24h, emails: sent };
    } catch (e) {
      byProject[p.id] = { error: (e as Error).message };
      log.error("daily_report.project_failed", {
        projectId: p.id,
        error: (e as Error).message,
      });
    }
  }
  const ms = Date.now() - t0;
  log.info("daily_report.cron.ok", { ms, projects: projects.length });
  return NextResponse.json({ ok: true, ms, projects: projects.length, byProject });
}
