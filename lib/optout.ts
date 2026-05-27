// Opt-out global cross-channel. Regla dura: una baja saca a la persona de
// TODOS los canales y se respeta para siempre (ARCHITECTURE §5.5). Se consulta
// ANTES de cada envío, en la cola.
//
// DESIGN: la tabla opt_outs usa `dni` como PK (no hay columna `id`).
// El supabaseRepo genérico filtra por `.eq("id", id)`, que no matchea esa
// tabla. Por eso usamos getSupabase() directo cuando hay DB, y memoryRepo
// (keyed by dni) cuando no hay. El memoryRepo key = dni (seteamos id=dni).
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { memoryRepo } from "@/lib/db/memory";
import { enqueueSheetSync } from "@/lib/db/mirror";

export interface OptOut {
  id?: string; // = dni (clave del repo en memoria)
  dni: string;
  at: string;
  reason?: string;
}

// memoryRepo keyed by dni (id = dni) para el path sin Supabase.
const mem = () => memoryRepo<OptOut>("opt_outs");

export async function optOut(dni: string, reason?: string): Promise<OptOut> {
  if (dbConfigured()) {
    const sb = getSupabase();
    const { data: existing } = await sb
      .from("opt_outs")
      .select("*")
      .eq("dni", dni)
      .maybeSingle();
    if (existing) return existing as OptOut; // no expira, no se pisa
    const row = { dni, at: new Date().toISOString(), reason };
    const { data, error } = await sb
      .from("opt_outs")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    await enqueueSheetSync("opt_outs", "upsert", data);
    return data as OptOut;
  }
  // Memoria: keyed by dni (id = dni).
  const existing = await mem().get(dni);
  if (existing) return existing; // no expira, no se pisa
  return mem().upsert({ id: dni, dni, at: new Date().toISOString(), reason });
}

export async function isOptedOut(dni: string): Promise<boolean> {
  if (dbConfigured()) {
    const { data } = await getSupabase()
      .from("opt_outs")
      .select("dni")
      .eq("dni", dni)
      .maybeSingle();
    return Boolean(data);
  }
  return Boolean(await mem().get(dni));
}

export async function listOptOuts(): Promise<OptOut[]> {
  if (dbConfigured()) {
    const { data, error } = await getSupabase()
      .from("opt_outs")
      .select("*")
      .order("at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as OptOut[];
  }
  return (await mem().list()).sort((a, b) => b.at.localeCompare(a.at));
}

// Para filtrar listas sin await por elemento: set de DNIs dados de baja.
export async function optedOutSet(): Promise<Set<string>> {
  return new Set((await listOptOuts()).map((o) => o.dni));
}
