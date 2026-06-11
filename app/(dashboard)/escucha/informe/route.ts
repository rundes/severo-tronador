// GET /escucha/informe — genera un PDF con los ítems de escucha marcados
// por el proyecto activo. Requiere proyecto y usa @react-pdf/renderer server-side.
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireProject } from "@/lib/workspace";
import { listMarcas } from "@/lib/escucha-marcas";
import { EscuchaInformeDocument } from "@/lib/pdf/escucha-pdf";
import { log } from "@/lib/logger";

export const runtime = "nodejs"; // react-pdf necesita node, no edge.

export async function GET() {
  const project = await requireProject();
  const marcas = await listMarcas(project.id);

  try {
    const buffer = await renderToBuffer(
      EscuchaInformeDocument({
        marcas,
        meta: {
          projectName: project.nombre,
          generatedAt: new Date().toLocaleString("es-AR"),
        },
      }),
    );
    log.info("pdf.escucha.generated", {
      project_id: project.id,
      items: marcas.length,
      bytes: buffer.length,
    });
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="informe-escucha.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    log.error("pdf.escucha.failed", {
      project_id: project.id,
      msg: (err as Error).message,
    });
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
