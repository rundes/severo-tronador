// Tracking de cuotas — las cuotas son ciudadanos de primera clase (ARCHITECTURE
// §4). La cola chequea cuota ANTES de cada envío, no después.
//
// Sub-task 9.2: persiste en Supabase `cuotas` cuando la DB está configurada;
// cae a un Map en memoria (globalThis, sobrevive al HMR de dev) cuando no.
// La tabla cuotas usa connector_id como PK, por lo que se llama a getSupabase()
// directamente en lugar de pasar por supabaseRepo.

import { dbConfigured, getSupabase } from "@/lib/db/supabase";

const g = globalThis as unknown as { __quotaMem?: Map<string, number> };
const mem = (g.__quotaMem ??= new Map());

// Primer día del mes siguiente (UTC) — reset del free tier mensual.
export function nextMonthlyReset(now = Date.now()): string {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
}

export async function getUsage(connectorId: string): Promise<number> {
  if (!dbConfigured()) return mem.get(connectorId) ?? 0;
  const { data } = await getSupabase()
    .from("cuotas")
    .select("used")
    .eq("connector_id", connectorId)
    .maybeSingle();
  return data?.used ?? 0;
}

export async function incrementUsage(connectorId: string, n = 1): Promise<number> {
  if (!dbConfigured()) {
    const v = (mem.get(connectorId) ?? 0) + n;
    mem.set(connectorId, v);
    return v;
  }
  const current = await getUsage(connectorId);
  const used = current + n;
  await getSupabase()
    .from("cuotas")
    .upsert(
      {
        connector_id: connectorId,
        used,
        resets_at: nextMonthlyReset(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "connector_id" },
    );
  return used;
}

export async function resetUsage(connectorId: string): Promise<void> {
  if (!dbConfigured()) {
    mem.set(connectorId, 0);
    return;
  }
  await getSupabase()
    .from("cuotas")
    .upsert(
      { connector_id: connectorId, used: 0, updated_at: new Date().toISOString() },
      { onConflict: "connector_id" },
    );
}
