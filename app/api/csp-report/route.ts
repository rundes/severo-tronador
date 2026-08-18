// Receptor de reportes de la CSP en report-only (ver next.config.ts).
//
// Sirve para calibrar la política antes de aplicarla: cada violación dice qué
// se rompería si la CSP estuviera activa. Sólo loguea — no persiste — porque el
// volumen inicial es alto y ruidoso, y lo que interesa es el conjunto de
// directivas violadas, no cada evento.
//
// Ruta pública a propósito (el navegador la postea sin sesión), así que asume
// que el cuerpo es basura hasta demostrar lo contrario y nunca devuelve error:
// un 4xx acá sólo llenaría la consola del usuario.
import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

interface CspReport {
  "document-uri"?: string;
  "violated-directive"?: string;
  "effective-directive"?: string;
  "blocked-uri"?: string;
  "line-number"?: number;
  "source-file"?: string;
}

export async function POST(req: Request) {
  // Endpoint público sin auth: un tope evita que se convierta en un canal para
  // inundar los logs.
  if (!consumeRateLimit("csp-report", 240, 60_000).ok) {
    return new NextResponse(null, { status: 204 });
  }
  try {
    const body = (await req.json()) as { "csp-report"?: CspReport } & CspReport;
    const r = body["csp-report"] ?? body;
    log.warn("csp.violation", {
      directive: r["effective-directive"] ?? r["violated-directive"] ?? null,
      blocked: r["blocked-uri"] ?? null,
      document: r["document-uri"] ?? null,
      source: r["source-file"] ?? null,
      line: r["line-number"] ?? null,
    });
  } catch {
    // Cuerpo ilegible: no vale la pena ni loguearlo con detalle.
    log.debug("csp.report.unparseable");
  }
  return new NextResponse(null, { status: 204 });
}
