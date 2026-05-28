// Export CSV de la audiencia segmentada (Plan 02 — F1.5).
//
// GET /api/segmentos/export?<filter-params>
// Auth: middleware redirige a signin sin sesión.
import { applySegment, filterFromParams, loadContacts } from "@/lib/segments";
import { healthBand } from "@/lib/relationship";

const COLS = [
  "dni",
  "nombre",
  "apellido",
  "edad",
  "sexo",
  "barrio",
  "circuito",
  "telefono",
  "email",
  "health_score",
  "health_band",
  "preferred_channel",
  "status",
];

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const params: Record<string, string | undefined> = {};
  for (const [k, v] of url.searchParams.entries()) params[k] = v;

  const filter = filterFromParams(params);
  const all = await loadContacts();
  const matched = applySegment(all, filter);

  const rows: string[] = [COLS.join(",")];
  for (const m of matched) {
    rows.push(
      [
        m.contact.dni,
        m.contact.nombre,
        m.contact.apellido,
        m.edad ?? "",
        m.contact.sexo ?? "",
        m.contact.barrio ?? "",
        m.contact.circuito ?? "",
        m.contact.telefono ?? "",
        m.contact.email ?? "",
        m.rel.healthScore,
        healthBand(m.rel.healthScore),
        m.rel.preferredChannel ?? "",
        m.rel.status,
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  const body = rows.join("\n");
  const filename = `segmento-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
