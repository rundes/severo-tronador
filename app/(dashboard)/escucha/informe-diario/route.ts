// PDF de un informe diario guardado (vigente o historial) para el proyecto
// activo. ?at=<iso del informe>. Descarga (attachment).
import { NextResponse } from "next/server";
import { getActiveProject } from "@/lib/workspace";
import { getListeningConfig } from "@/lib/listening-config";
import { readDailyReports } from "@/lib/daily-report";
import { renderDailyReportPdf } from "@/lib/pdf/daily-report-pdf";
import { reportFilename } from "@/lib/report-file";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const active = await getActiveProject();
  if (!active) return NextResponse.json({ error: "no_project" }, { status: 403 });
  const at = new URL(req.url).searchParams.get("at") ?? "";
  const store = await readDailyReports(active.id);
  const report = [store.latest, ...store.history].find((r) => r && r.at === at);
  if (!report) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const cfg = await getListeningConfig(active.id);
    const pdf = await renderDailyReportPdf({ report, project: active.nombre, zona: cfg.zona ?? "" });
    log.info("pdf.daily_report.generated", { projectId: active.id, at, bytes: pdf.length });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${reportFilename(active.nombre, report.at)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    log.error("pdf.daily_report.failed", { projectId: active.id, error: (e as Error).message });
    return NextResponse.json({ error: "pdf_failed" }, { status: 500 });
  }
}
