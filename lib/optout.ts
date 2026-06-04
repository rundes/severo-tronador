// Opt-out cross-channel POR PROYECTO. Regla dura: una baja saca a la persona de
// TODOS los canales del proyecto y se respeta para siempre (ARCHITECTURE §5.5).
// Se consulta ANTES de cada envío, en la cola.
//
// DESIGN: opt_outs tiene PK (project_id, dni). Usamos getSupabase() directo con
// DB y memoryRepo (keyed by `${projectId}:${dni}`) sin DB.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { memoryRepo } from "@/lib/db/memory";
import { enqueueSheetSync } from "@/lib/db/mirror";

export interface OptOut {
  id?: string; // = `${project_id}:${dni}` (clave del repo en memoria)
  project_id?: string;
  dni: string;
  at: string;
  reason?: string;
}

const mem = () => memoryRepo<OptOut>("opt_outs");
const memId = (projectId: string, dni: string) => `${projectId}:${dni}`;

export async function optOut(
  projectId: string,
  dni: string,
  reason?: string,
): Promise<OptOut> {
  if (dbConfigured()) {
    const sb = getSupabase();
    const { data: existing } = await sb
      .from("opt_outs")
      .select("*")
      .eq("project_id", projectId)
      .eq("dni", dni)
      .maybeSingle();
    if (existing) return existing as OptOut; // no expira, no se pisa
    const row = {
      project_id: projectId,
      dni,
      at: new Date().toISOString(),
      reason,
    };
    const { data, error } = await sb
      .from("opt_outs")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    await enqueueSheetSync("opt_outs", "upsert", data);
    return data as OptOut;
  }
  const existing = await mem().get(memId(projectId, dni));
  if (existing) return existing;
  return mem().upsert({
    id: memId(projectId, dni),
    project_id: projectId,
    dni,
    at: new Date().toISOString(),
    reason,
  });
}

export async function isOptedOut(
  projectId: string,
  dni: string,
): Promise<boolean> {
  if (dbConfigured()) {
    const { data } = await getSupabase()
      .from("opt_outs")
      .select("dni")
      .eq("project_id", projectId)
      .eq("dni", dni)
      .maybeSingle();
    return Boolean(data);
  }
  return Boolean(await mem().get(memId(projectId, dni)));
}

export async function listOptOuts(projectId: string): Promise<OptOut[]> {
  if (dbConfigured()) {
    const { data, error } = await getSupabase()
      .from("opt_outs")
      .select("*")
      .eq("project_id", projectId)
      .order("at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as OptOut[];
  }
  return (await mem().list())
    .filter((o) => o.project_id === projectId)
    .sort((a, b) => b.at.localeCompare(a.at));
}

// Set de DNIs dados de baja en el proyecto (para filtrar listas sin await).
export async function optedOutSet(projectId: string): Promise<Set<string>> {
  return new Set((await listOptOuts(projectId)).map((o) => o.dni));
}
