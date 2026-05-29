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

// Reemplaza el padrón cargado (upsert por dni en lotes).
export async function importPadron(rows: Contact[], source: string): Promise<number> {
  if (!dbConfigured()) throw new Error("Supabase no configurado");
  const db = getSupabase();
  const withSource = rows.map((r) => ({ ...r, source }));
  for (let i = 0; i < withSource.length; i += 500) {
    const { error } = await db.from("padron").upsert(withSource.slice(i, i + 500), { onConflict: "dni" });
    if (error) throw error;
  }
  return rows.length;
}

export async function readPadronFromDb(limit?: number): Promise<Contact[]> {
  if (!dbConfigured()) return [];
  let q = getSupabase().from("padron").select("*");
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
  if (error) {
    // Mensaje user-friendly; el boundary muestra esto. El detail técnico ya
    // está en el message original (`error.message`), no leakea info sensible.
    throw new Error(`No se pudo leer el padrón desde Supabase: ${error.message}`);
  }
  return (data ?? []) as Contact[];
}

export async function padronCount(): Promise<number> {
  if (!dbConfigured()) return 0;
  const { count } = await getSupabase().from("padron").select("*", { count: "exact", head: true });
  return count ?? 0;
}
