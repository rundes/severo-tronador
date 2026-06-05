// Export CSV de las respuestas de una encuesta. Una fila por respuesta,
// columnas = metadatos + una por pregunta (en el orden de la encuesta).
import { getEncuesta } from "@/lib/encuestas";
import { listEncuestaResponses } from "@/lib/encuestas/responses";
import { requireProject } from "@/lib/workspace";
import type { Answer } from "@/lib/encuestas/types";

function csvCell(v: string): string {
  // Prefijo anti CSV-injection en Excel/Sheets para celdas que empiezan con =,+,-,@.
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

function answerToText(a: Answer | undefined): string {
  if (!a) return "";
  if (Array.isArray(a.value)) return a.value.join("; ");
  if (typeof a.value === "boolean") return a.value ? "Sí" : "No";
  return String(a.value);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { id: projectId } = await requireProject();
  const enc = await getEncuesta(projectId, id);
  if (!enc) return new Response("Not found", { status: 404 });

  const responses = await listEncuestaResponses(projectId, id);
  const header = ["fecha", "origen", "dni", ...enc.preguntas.map((q) => q.label)];
  const lines = [header.map(csvCell).join(",")];

  for (const r of responses) {
    const byId = new Map(r.answers.map((a) => [a.questionId, a]));
    const row = [
      r.at,
      r.source,
      r.dni ?? "",
      ...enc.preguntas.map((q) => answerToText(byId.get(q.id))),
    ];
    lines.push(row.map(csvCell).join(","));
  }

  const csv = "﻿" + lines.join("\r\n"); // BOM para acentos en Excel
  const fname = `encuesta-${enc.slug ?? enc.id}.csv`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${fname}"`,
    },
  });
}
