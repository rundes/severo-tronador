import { dbConfigured, getSupabase } from "./supabase";
import type { Contact } from "@/lib/connectors/types";

const COLS = ["dni","nombre","apellido","fecha_nac","sexo","domicilio","barrio","circuito","mesa","telefono","email","x_handle","afiliacion"];

// Separa un registro en columnas reales (COLS) y campos personalizados, que van
// a la columna jsonb `custom`. `base` son campos fijos extra (project_id, etc).
function splitCustom(
  row: Record<string, unknown>,
  base: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  const custom: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "project_id" || k === "source" || k === "custom" || k === "grupo_id") continue;
    if (COLS.includes(k)) out[k] = v;
    else if (v != null && v !== "") custom[k] = v;
  }
  out.custom = custom;
  return out;
}

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
  const withSource = rows.map((r) =>
    splitCustom(r as unknown as Record<string, unknown>, {
      project_id: projectId,
      source,
    }),
  );
  for (let i = 0; i < withSource.length; i += 500) {
    const { error } = await db
      .from("padron")
      .upsert(withSource.slice(i, i + 500), { onConflict: "project_id,dni" });
    if (error) throw error;
  }
  return rows.length;
}

const PAGE = 1000; // PostgREST devuelve máximo 1000 filas por request.

// Alta/edición manual de un contacto (upsert por (project_id, dni)). Opcional
// grupo_id. source 'manual' para distinguir de los importados.
export async function addPadronContact(
  projectId: string,
  contact: Record<string, unknown>,
  grupoId?: string | null,
): Promise<void> {
  if (!dbConfigured()) throw new Error("Supabase no configurado");
  const row = splitCustom(contact, {
    project_id: projectId,
    source: "manual",
    grupo_id: grupoId ?? null,
  });
  const { error } = await getSupabase()
    .from("padron")
    .upsert(row, { onConflict: "project_id,dni" });
  if (error) throw error;
}

// Asigna (o quita, con grupoId null) un grupo a TODOS los contactos del
// proyecto. Devuelve cuántos se actualizaron.
export async function assignGroupToAll(
  projectId: string,
  grupoId: string | null,
): Promise<number> {
  if (!dbConfigured()) throw new Error("Supabase no configurado");
  const { error, count } = await getSupabase()
    .from("padron")
    .update({ grupo_id: grupoId }, { count: "exact" })
    .eq("project_id", projectId);
  if (error) throw error;
  return count ?? 0;
}

// Borra TODOS los contactos del proyecto. Devuelve cuántos se eliminaron.
export async function deleteAllPadron(projectId: string): Promise<number> {
  if (!dbConfigured()) throw new Error("Supabase no configurado");
  const { error, count } = await getSupabase()
    .from("padron")
    .delete({ count: "exact" })
    .eq("project_id", projectId);
  if (error) throw error;
  return count ?? 0;
}

// Asigna (o quita) un grupo a un subconjunto de contactos por DNI. Pagina los
// DNIs en lotes para no exceder el largo de URL de PostgREST.
export async function assignGroupToDnis(
  projectId: string,
  grupoId: string | null,
  dnis: string[],
): Promise<number> {
  if (!dbConfigured()) throw new Error("Supabase no configurado");
  const unique = [...new Set(dnis.map((d) => d.trim()).filter(Boolean))];
  if (unique.length === 0) return 0;
  const sb = getSupabase();
  const BATCH = 200;
  let total = 0;
  for (let i = 0; i < unique.length; i += BATCH) {
    const chunk = unique.slice(i, i + BATCH);
    const { error, count } = await sb
      .from("padron")
      .update({ grupo_id: grupoId }, { count: "exact" })
      .eq("project_id", projectId)
      .in("dni", chunk);
    if (error) throw error;
    total += count ?? 0;
  }
  return total;
}

// Borra un subconjunto de contactos por DNI (selección). Pagina en lotes.
export async function deleteContactosByDnis(
  projectId: string,
  dnis: string[],
): Promise<number> {
  if (!dbConfigured()) throw new Error("Supabase no configurado");
  const unique = [...new Set(dnis.map((d) => d.trim()).filter(Boolean))];
  if (unique.length === 0) return 0;
  const sb = getSupabase();
  const BATCH = 200;
  let total = 0;
  for (let i = 0; i < unique.length; i += BATCH) {
    const chunk = unique.slice(i, i + BATCH);
    const { error, count } = await sb
      .from("padron")
      .delete({ count: "exact" })
      .eq("project_id", projectId)
      .in("dni", chunk);
    if (error) throw error;
    total += count ?? 0;
  }
  return total;
}

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

// Los DNIs del proyecto que corresponden a una lista de emails. Query puntual
// (`in`) en vez de traer el padrón entero: se usa en el compositor de mail, que
// manda a un puñado de destinatarios. El match es case-insensitive por el lado
// del input; padron.email se guarda en minúsculas al importar.
export async function dnisByEmails(
  projectId: string,
  emails: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const wanted = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!dbConfigured() || wanted.length === 0) return out;
  const { data, error } = await getSupabase()
    .from("padron")
    .select("dni, email")
    .eq("project_id", projectId)
    .in("email", wanted);
  if (error) {
    throw new Error(`No se pudo resolver contactos por email: ${error.message}`);
  }
  for (const row of (data ?? []) as { dni: string; email: string | null }[]) {
    if (row.email) out.set(row.email.trim().toLowerCase(), row.dni);
  }
  return out;
}

// Un contacto puntual por (proyecto, dni). Incluye la columna custom (jsonb).
export async function readPadronContact(
  projectId: string,
  dni: string,
): Promise<Contact | null> {
  if (!dbConfigured()) return null;
  const { data, error } = await getSupabase()
    .from("padron")
    .select("*")
    .eq("project_id", projectId)
    .eq("dni", dni)
    .maybeSingle();
  if (error) {
    throw new Error(`No se pudo leer el contacto: ${error.message}`);
  }
  return (data as Contact) ?? null;
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

// Total del padrón para la paginación de /contactos.
//
// `estimated` en vez de `exact`: el count exacto es un scan completo de la
// tabla en cada carga del dashboard y de /contactos. Para decidir cuántas
// páginas mostrar, la estimación del planner alcanza. PostgREST cae solo a un
// count exacto cuando la tabla es chica, que es cuando la estimación sería
// mala.
export async function padronCount(projectId: string): Promise<number> {
  if (!dbConfigured()) return 0;
  const { count } = await getSupabase()
    .from("padron")
    .select("*", { count: "estimated", head: true })
    .eq("project_id", projectId);
  return count ?? 0;
}
