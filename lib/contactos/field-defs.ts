import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { BASE_FIELD_KEYS } from "./mapping";

// Definiciones de campos personalizados del padrón, por proyecto. Los valores
// se guardan en padron.custom (jsonb). Acceso server-side (service role).

export type FieldType = "text" | "number" | "date" | "select";

export interface FieldDef {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  options: string[] | null;
  position: number;
}

// key estable derivada del label (slug). Sin acentos, a-z0-9_, máx 40.
export function slugifyKey(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export async function listFieldDefs(projectId: string): Promise<FieldDef[]> {
  if (!dbConfigured()) return [];
  const { data, error } = await getSupabase()
    .from("padron_field_defs")
    .select("*")
    .eq("project_id", projectId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FieldDef[];
}

export async function createFieldDef(
  projectId: string,
  input: { label: string; type: FieldType; options?: string[] | null },
): Promise<void> {
  if (!dbConfigured()) throw new Error("Supabase no configurado");
  const label = input.label.trim();
  const key = slugifyKey(label);
  if (!key) throw new Error("El nombre del campo no es válido.");
  if (BASE_FIELD_KEYS.includes(key)) {
    throw new Error(`"${key}" ya es un campo básico del padrón.`);
  }
  const defs = await listFieldDefs(projectId);
  if (defs.some((d) => d.key === key)) {
    throw new Error(`Ya existe un campo "${key}".`);
  }
  const { error } = await getSupabase().from("padron_field_defs").insert({
    project_id: projectId,
    key,
    label,
    type: input.type,
    options:
      input.type === "select"
        ? (input.options ?? []).filter((o) => o.trim() !== "")
        : null,
    position: defs.length,
  });
  if (error) throw error;
}

export async function deleteFieldDef(
  projectId: string,
  id: string,
): Promise<void> {
  if (!dbConfigured()) throw new Error("Supabase no configurado");
  const { error } = await getSupabase()
    .from("padron_field_defs")
    .delete()
    .eq("project_id", projectId)
    .eq("id", id);
  if (error) throw error;
}
