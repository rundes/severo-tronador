// Lee los handles de X mapeados en el padrón para que las fuentes de
// listening puedan filtrar/incluir contenido de esos ciudadanos
// específicos. Normaliza el handle quitando "@" y espacios.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";

export function normalizeHandle(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

// Devuelve handles únicos no vacíos. Limit alto porque el caller usa el
// resultado para construir una query OR-joined (X tiene techo 512 chars).
export async function getMappedXHandles(limit = 500): Promise<string[]> {
  if (!dbConfigured()) return [];
  const { data, error } = await getSupabase()
    .from("padron")
    .select("x_handle")
    .not("x_handle", "is", null)
    .limit(limit);
  if (error) return [];
  const set = new Set<string>();
  for (const row of (data ?? []) as { x_handle: string | null }[]) {
    const h = normalizeHandle(row.x_handle);
    if (h) set.add(h);
  }
  return Array.from(set);
}
