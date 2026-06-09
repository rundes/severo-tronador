// Persistencia de "contextos" (briefs) del Estudio de contenido: prompt +
// referencias (links/imágenes/videos) + plataformas. Reutilizables entre
// sesiones. getSupabase directo + memory fallback para dev/tests.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";

export interface SavedBrief {
  id: string;
  project_id?: string;
  nombre: string;
  prompt: string;
  links: string[];
  images: string[];
  videos: string[];
  platforms: string[];
  created_by?: string | null;
  updated_at?: string;
}

export interface BriefInput {
  nombre: string;
  prompt: string;
  links: string[];
  images: string[];
  videos: string[];
  platforms: string[];
}

interface MemStore {
  __estudioBriefs?: SavedBrief[];
}
const g = globalThis as unknown as MemStore;
const mem = (g.__estudioBriefs ??= []);

export async function listBriefs(projectId: string): Promise<SavedBrief[]> {
  if (!dbConfigured()) {
    return mem
      .filter((b) => b.project_id === projectId)
      .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  }
  const { data, error } = await getSupabase()
    .from("estudio_briefs")
    .select("*")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SavedBrief[];
}

// Crea (sin id) o actualiza (con id) un brief. Devuelve la fila resultante.
export async function saveBrief(
  projectId: string,
  input: BriefInput,
  createdBy?: string,
  id?: string,
): Promise<SavedBrief> {
  const row = {
    project_id: projectId,
    nombre: input.nombre,
    prompt: input.prompt,
    links: input.links,
    images: input.images,
    videos: input.videos,
    platforms: input.platforms,
  };

  if (!dbConfigured()) {
    if (id) {
      const existing = mem.find((b) => b.id === id && b.project_id === projectId);
      if (existing) {
        Object.assign(existing, row, { updated_at: new Date().toISOString() });
        return existing;
      }
    }
    const created: SavedBrief = {
      id: crypto.randomUUID(),
      ...row,
      created_by: createdBy ?? null,
      updated_at: new Date().toISOString(),
    };
    mem.push(created);
    return created;
  }

  if (id) {
    const { data, error } = await getSupabase()
      .from("estudio_briefs")
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("project_id", projectId)
      .select()
      .single();
    if (error) throw error;
    return data as SavedBrief;
  }

  const { data, error } = await getSupabase()
    .from("estudio_briefs")
    .insert({ ...row, created_by: createdBy ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as SavedBrief;
}

export async function deleteBrief(projectId: string, id: string): Promise<void> {
  if (!dbConfigured()) {
    const idx = mem.findIndex((b) => b.id === id && b.project_id === projectId);
    if (idx >= 0) mem.splice(idx, 1);
    return;
  }
  const { error } = await getSupabase()
    .from("estudio_briefs")
    .delete()
    .eq("id", id)
    .eq("project_id", projectId);
  if (error) throw error;
}
