// Descartes de escucha: menciones que el usuario oculta del feed (señal "no
// relevante", reversible). Persistencia en Supabase (tabla escucha_descartes,
// migración 0046). Resiliente: sin DB o sin la tabla aplicada, degrada a vacío
// / no-op para no romper el feed.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";

export interface Descarte {
  itemKey: string;
  payload: Record<string, unknown>;
}

// itemKeys descartados del proyecto. Si la tabla aún no existe (migración sin
// aplicar) el error se traga y devolvemos [] — el feed sigue funcionando.
export async function listDescartes(projectId: string): Promise<string[]> {
  if (!dbConfigured()) return [];
  const { data, error } = await getSupabase()
    .from("escucha_descartes")
    .select("item_key")
    .eq("project_id", projectId);
  if (error) return [];
  return (data ?? []).map((r) => (r as { item_key: string }).item_key);
}

// toggle: si existe (project_id, item_key) la restaura (borra); si no, descarta
// (inserta). Mismo patrón que toggleMarca.
export async function toggleDescarte(
  projectId: string,
  d: Descarte,
): Promise<{ ok: boolean; descartado: boolean; msg: string }> {
  if (!dbConfigured()) {
    return { ok: false, descartado: false, msg: "Supabase no configurado" };
  }
  const sb = getSupabase();
  const { data: existing, error: selErr } = await sb
    .from("escucha_descartes")
    .select("id")
    .eq("project_id", projectId)
    .eq("item_key", d.itemKey)
    .maybeSingle();
  if (selErr) throw selErr;

  if (existing) {
    const { error } = await sb
      .from("escucha_descartes")
      .delete()
      .eq("project_id", projectId)
      .eq("item_key", d.itemKey);
    if (error) throw error;
    return { ok: true, descartado: false, msg: "Restaurada al feed" };
  }

  const { error } = await sb.from("escucha_descartes").insert({
    project_id: projectId,
    item_key: d.itemKey,
    payload: d.payload,
  });
  if (error) throw error;
  return { ok: true, descartado: true, msg: "Descartada" };
}
