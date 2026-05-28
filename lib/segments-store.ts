// Persistencia de segmentos guardados (Plan 02 — F1.2). Tabla `segmentos`
// ya existe (0001_init.sql). Usamos getSupabase directo para mantener el
// shape `filtros jsonb` sin pasar por el repo genérico (que necesita
// nombres de columna específicos).
import { dbConfigured, getSupabase } from "@/lib/db/supabase";

// Shape relajado para persistir. Todos los campos opcionales — espejado
// del SegmentFilter usado en lib/segments.ts pero independiente del schema
// zod (que marca cada propiedad con `| undefined` y rompe el inference).
export interface SavedFilters {
  sexo?: "F" | "M";
  edadMin?: number;
  edadMax?: number;
  barrio?: string;
  circuito?: string;
  mesa?: string;
  healthMin?: number;
  healthBands?: ("green" | "yellow" | "red")[];
  respondedWithinDays?: number;
  notContactedDays?: number;
  hasEmail?: boolean;
  hasTelefono?: boolean;
  preferredChannel?: "email" | "whatsapp" | "sms" | "voice";
}

export interface SavedSegment {
  id: string;
  nombre: string;
  filtros: SavedFilters;
  created_by: string | null;
  created_at: string;
}

interface MemStore {
  __segmentos?: SavedSegment[];
}

const g = globalThis as unknown as MemStore;
const mem = (g.__segmentos ??= []);

export async function listSavedSegments(): Promise<SavedSegment[]> {
  if (!dbConfigured()) {
    return [...mem].sort((a, b) =>
      (b.created_at ?? "").localeCompare(a.created_at ?? ""),
    );
  }
  const { data, error } = await getSupabase()
    .from("segmentos")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SavedSegment[];
}

export async function getSavedSegment(
  id: string,
): Promise<SavedSegment | undefined> {
  if (!dbConfigured()) return mem.find((s) => s.id === id);
  const { data, error } = await getSupabase()
    .from("segmentos")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? undefined) as SavedSegment | undefined;
}

export async function saveSegment(
  nombre: string,
  filtros: SavedFilters,
  createdBy?: string,
): Promise<SavedSegment> {
  if (!dbConfigured()) {
    const row: SavedSegment = {
      id: crypto.randomUUID(),
      nombre,
      filtros,
      created_by: createdBy ?? null,
      created_at: new Date().toISOString(),
    };
    mem.push(row);
    return row;
  }
  const { data, error } = await getSupabase()
    .from("segmentos")
    .insert({ nombre, filtros, created_by: createdBy ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as SavedSegment;
}

export async function deleteSegment(id: string): Promise<void> {
  if (!dbConfigured()) {
    const idx = mem.findIndex((s) => s.id === id);
    if (idx >= 0) mem.splice(idx, 1);
    return;
  }
  const { error } = await getSupabase().from("segmentos").delete().eq("id", id);
  if (error) throw error;
}
