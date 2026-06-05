import { dbConfigured, getSupabase } from "./supabase";
import type { Contact } from "@/lib/connectors/types";

const COLS = ["dni","nombre","apellido","fecha_nac","sexo","domicilio","barrio","circuito","mesa","telefono","email","x_handle"];

export function parsePadronCsv(csv: string): Contact[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { if (COLS.includes(h)) o[h] = (cells[i] ?? "").trim(); });
    return o as unknown as Contact;
  }).filter((c) => c.dni);
}

// Reemplaza el padrón cargado del proyecto (upsert por (project_id, dni)).
export async function importPadron(
  projectId: string,
  rows: Contact[],
  source: string,
): Promise<number> {
  if (!dbConfigured()) throw new Error("Supabase no configurado");
  const db = getSupabase();
  const withSource = rows.map((r) => ({ ...r, project_id: projectId, source }));
  for (let i = 0; i < withSource.length; i += 500) {
    const { error } = await db
      .from("padron")
      .upsert(withSource.slice(i, i + 500), { onConflict: "project_id,dni" });
    if (error) throw error;
  }
  return rows.length;
}

const PAGE = 1000; // PostgREST devuelve máximo 1000 filas por request.

export async function readPadronFromDb(
  projectId: string,
  limit?: number,
): Promise<Contact[]> {
  if (!dbConfigured()) return [];
  const sb = getSupabase();

  if (limit && limit <= PAGE) {
    const { data, error } = await sb
      .from("padron")
      .select("*")
      .eq("project_id", projectId)
      .limit(limit);
    if (error) {
      throw new Error(`No se pudo leer el padrón desde Supabase: ${error.message}`);
    }
    return (data ?? []) as Contact[];
  }

  // Sin límite (o > PAGE): paginar con range() para traer TODO el padrón.
  // Sin esto PostgREST corta en 1000 y los segmentos calcularían sobre una
  // muestra parcial. order(dni) da paginación estable.
  const out: Contact[] = [];
  for (let from = 0; ; from += PAGE) {
    const to = limit ? Math.min(from + PAGE, limit) - 1 : from + PAGE - 1;
    const { data, error } = await sb
      .from("padron")
      .select("*")
      .eq("project_id", projectId)
      .order("dni", { ascending: true })
      .range(from, to);
    if (error) {
      throw new Error(`No se pudo leer el padrón desde Supabase: ${error.message}`);
    }
    const batch = (data ?? []) as Contact[];
    out.push(...batch);
    if (batch.length < PAGE || (limit && out.length >= limit)) break;
  }
  return out;
}

// Una página de contactos (para la tabla de /contactos). Ordena por apellido.
export async function readPadronPage(
  projectId: string,
  offset: number,
  limit: number,
): Promise<Contact[]> {
  if (!dbConfigured()) return [];
  const { data, error } = await getSupabase()
    .from("padron")
    .select("*")
    .eq("project_id", projectId)
    .order("apellido", { ascending: true })
    .order("nombre", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) {
    throw new Error(`No se pudo leer el padrón desde Supabase: ${error.message}`);
  }
  return (data ?? []) as Contact[];
}

export async function padronCount(projectId: string): Promise<number> {
  if (!dbConfigured()) return 0;
  const { count } = await getSupabase()
    .from("padron")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId);
  return count ?? 0;
}
