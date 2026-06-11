// Marcas de escucha: items de feed/temas que el usuario marca para incluir en
// un informe PDF. Persistencia en Supabase (tabla escucha_marcas); sin DB
// devuelve vacío / no-op con mensaje claro.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
// itemKey vive en un módulo puro (client-safe) y se re-exporta acá para no
// romper los imports existentes.
import { itemKey, volumeBuckets } from "@/lib/escucha-keys";

export { itemKey, volumeBuckets };

export interface Marca {
  itemKey: string;
  kind: "feed" | "topic";
  payload: Record<string, unknown>;
  createdAt?: string;
}

export async function listMarcas(projectId: string): Promise<Marca[]> {
  if (!dbConfigured()) return [];
  const { data, error } = await getSupabase()
    .from("escucha_marcas")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    itemKey: row.item_key as string,
    kind: row.kind as "feed" | "topic",
    payload: row.payload as Record<string, unknown>,
    createdAt: row.created_at as string,
  }));
}

// toggle: si existe (project_id, item_key) borra y devuelve {marked:false};
// si no existe, inserta y devuelve {marked:true}.
export async function toggleMarca(
  projectId: string,
  m: Marca,
): Promise<{ ok: boolean; marked: boolean; msg: string }> {
  if (!dbConfigured()) {
    return { ok: false, marked: false, msg: "Supabase no configurado" };
  }
  // Check existence
  const { data: existing, error: selectError } = await getSupabase()
    .from("escucha_marcas")
    .select("id")
    .eq("project_id", projectId)
    .eq("item_key", m.itemKey)
    .maybeSingle();
  if (selectError) throw selectError;

  if (existing) {
    // Already marked → unmark
    const { error: delError } = await getSupabase()
      .from("escucha_marcas")
      .delete()
      .eq("project_id", projectId)
      .eq("item_key", m.itemKey);
    if (delError) throw delError;
    return { ok: true, marked: false, msg: "Marca eliminada" };
  }

  // Not marked → mark
  const { error: insertError } = await getSupabase()
    .from("escucha_marcas")
    .insert({
      project_id: projectId,
      item_key: m.itemKey,
      kind: m.kind,
      payload: m.payload,
    });
  if (insertError) throw insertError;
  return { ok: true, marked: true, msg: "Marcado para informe" };
}

