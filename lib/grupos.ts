// Grupos de contactos por proyecto. Supabase directo + memory fallback.
import { randomUUID } from "crypto";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";

export interface Grupo {
  id: string;
  nombre: string;
  count: number;
}

interface GrupoRow {
  id: string;
  project_id: string;
  nombre: string;
  created_at: string;
}

const g = globalThis as unknown as { __grupos?: GrupoRow[] };
const mem = (g.__grupos ??= []);

export async function listGrupos(projectId: string): Promise<Grupo[]> {
  if (!dbConfigured()) {
    return mem
      .filter((r) => r.project_id === projectId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((r) => ({ id: r.id, nombre: r.nombre, count: 0 }));
  }
  const sb = getSupabase();
  const { data, error } = await sb
    .from("grupos")
    .select("id, nombre")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const grupos = (data ?? []) as { id: string; nombre: string }[];
  // Conteo por grupo (head count). Pocos grupos → N queries livianas.
  return Promise.all(
    grupos.map(async (gr) => {
      const { count } = await sb
        .from("padron")
        .select("dni", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("grupo_id", gr.id);
      return { id: gr.id, nombre: gr.nombre, count: count ?? 0 };
    }),
  );
}

export async function createGrupo(
  projectId: string,
  nombre: string,
): Promise<Grupo> {
  const n = nombre.trim();
  if (!n) throw new Error("El nombre del grupo es obligatorio.");
  if (!dbConfigured()) {
    const row: GrupoRow = {
      id: randomUUID(),
      project_id: projectId,
      nombre: n,
      created_at: new Date().toISOString(),
    };
    mem.unshift(row);
    return { id: row.id, nombre: n, count: 0 };
  }
  const { data, error } = await getSupabase()
    .from("grupos")
    .insert({ project_id: projectId, nombre: n })
    .select("id, nombre")
    .single();
  if (error) throw error;
  return { id: (data as { id: string }).id, nombre: n, count: 0 };
}

// Valida que el grupo pertenezca al proyecto (evita asignar a un grupo ajeno).
export async function grupoExiste(
  projectId: string,
  grupoId: string,
): Promise<boolean> {
  if (!dbConfigured()) {
    return mem.some((r) => r.id === grupoId && r.project_id === projectId);
  }
  const { data } = await getSupabase()
    .from("grupos")
    .select("id")
    .eq("id", grupoId)
    .eq("project_id", projectId)
    .maybeSingle();
  return Boolean(data);
}

export function _clearGruposMem() {
  mem.length = 0;
}
