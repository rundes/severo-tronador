// Export bulk del dashboard (Plan 03 F6.2). Devuelve un zip con CSVs de
// las tablas operativas filtradas por la ventana. Útil para auditoría
// externa (AAIP) o mover datos a otro sistema.
//
// GET /api/dashboard/export?window=30 (7|30|90, default 30)
import { NextResponse } from "next/server";
import JSZip from "jszip";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { toCsv } from "@/lib/csv";
import { listAudit } from "@/lib/audit";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseWindow(v: string | null): 7 | 30 | 90 {
  if (v === "7") return 7;
  if (v === "90") return 90;
  return 30;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const windowDays = parseWindow(url.searchParams.get("window"));
  const since = new Date(Date.now() - windowDays * DAY_MS).toISOString();

  if (!dbConfigured()) {
    return NextResponse.json({ error: "no_db" }, { status: 503 });
  }

  const db = getSupabase();
  try {
    const [enviosRes, respuestasRes, campanasRes, optoutsRes, auditEntries] =
      await Promise.all([
        db
          .from("envios")
          .select("*")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(50000),
        db
          .from("respuestas")
          .select("*")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(50000),
        db
          .from("campanas")
          .select("*")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(5000),
        db
          .from("opt_outs")
          .select("*")
          .gte("at", since)
          .order("at", { ascending: false })
          .limit(50000),
        listAudit({ limit: 5000 }),
      ]);

    const zip = new JSZip();
    zip.file(
      "README.txt",
      [
        "Tronador · Export bulk",
        `Ventana: últimos ${windowDays} días desde ${new Date().toISOString()}`,
        "",
        "Archivos incluidos:",
        "  envios.csv      — envíos individuales (sent/failed/skipped)",
        "  respuestas.csv  — respuestas a encuestas tokenizadas",
        "  campanas.csv    — metadata de campañas",
        "  opt_outs.csv    — bajas cross-canal",
        "  audit_log.csv   — acciones en el panel",
        "",
        "Encoding: UTF-8. Separador: comma. Quote: doble. Newlines: LF.",
        "Generado por la API /api/dashboard/export — único request, sin caching.",
      ].join("\n"),
    );
    zip.file("envios.csv", toCsv(enviosRes.data ?? []));
    zip.file("respuestas.csv", toCsv(respuestasRes.data ?? []));
    zip.file("campanas.csv", toCsv(campanasRes.data ?? []));
    zip.file("opt_outs.csv", toCsv(optoutsRes.data ?? []));
    zip.file(
      "audit_log.csv",
      toCsv(auditEntries.map((e) => ({ ...e, details: JSON.stringify(e.details) }))),
    );

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const filename = `tronador-export-${windowDays}d-${new Date()
      .toISOString()
      .slice(0, 10)}.zip`;

    log.info("export.bulk.generated", {
      windowDays,
      envios: enviosRes.data?.length ?? 0,
      respuestas: respuestasRes.data?.length ?? 0,
      campanas: campanasRes.data?.length ?? 0,
      bytes: buffer.length,
    });

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    log.error("export.bulk.failed", { msg: (err as Error).message });
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
