// Registro manual de llamadas (ARCHITECTURE / PLAN F5): cuando un encuestador
// llama desde su celular, carga el resultado acá — no se necesita provider de
// voz. Scoped POR PROYECTO: la tabla llamadas tiene project_id (migración
// 0019); leer/escribir sin el filtro mezclaba llamadas de todos los proyectos.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { memoryRepo } from "@/lib/db/memory";

export type CallOutcome =
  | "contactado"
  | "no_atendio"
  | "rechazo"
  | "numero_invalido";

export const CALL_OUTCOMES: { value: CallOutcome; label: string }[] = [
  { value: "contactado", label: "Contactado / respondió" },
  { value: "no_atendio", label: "No atendió" },
  { value: "rechazo", label: "Rechazó / no quiere" },
  { value: "numero_invalido", label: "Número inválido" },
];

export interface ManualCall {
  id?: string;
  project_id?: string;
  dni: string;
  at: string; // ISO
  outcome: CallOutcome;
  notes?: string;
}

const mem = () => memoryRepo<ManualCall>("llamadas");

export async function addManualCall(
  projectId: string,
  input: Omit<ManualCall, "at" | "id" | "project_id">,
): Promise<ManualCall> {
  const row: ManualCall = {
    ...input,
    project_id: projectId,
    at: new Date().toISOString(),
  };
  if (dbConfigured()) {
    const { data, error } = await getSupabase()
      .from("llamadas")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return data as ManualCall;
  }
  return mem().upsert({ ...row, id: crypto.randomUUID() });
}

export async function listCallsFor(
  projectId: string,
  dni: string,
): Promise<ManualCall[]> {
  if (dbConfigured()) {
    const { data, error } = await getSupabase()
      .from("llamadas")
      .select("*")
      .eq("project_id", projectId)
      .eq("dni", dni)
      .order("at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []) as ManualCall[];
  }
  const all = await mem().list();
  return all
    .filter((c) => c.dni === dni && c.project_id === projectId)
    .sort((a, b) => b.at.localeCompare(a.at));
}
