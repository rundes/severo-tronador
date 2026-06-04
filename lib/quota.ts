// Tracking de cuotas POR PROYECTO — las cuotas son ciudadanos de primera clase
// (ARCHITECTURE §4). La cola chequea cuota ANTES de cada envío, no después.
//
// Persiste en Supabase `cuotas` (PK compuesta project_id + connector_id) cuando
// la DB está configurada; cae a un Map en memoria (globalThis) cuando no.
//
// `projectId` es el último parámetro y opcional (default = proyecto default):
// los conectores que aún no thread-ean proyecto (envío) siguen compilando y
// acumulan bajo el proyecto default hasta que se les pase explícito (Fase 3c/4).
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { DEFAULT_PROJECT_ID } from "@/lib/projects";

const g = globalThis as unknown as { __quotaMem?: Map<string, number> };
const mem = (g.__quotaMem ??= new Map());

const key = (projectId: string, connectorId: string) =>
  `${projectId}:${connectorId}`;

// Primer día del mes siguiente (UTC) — reset del free tier mensual.
export function nextMonthlyReset(now = Date.now()): string {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
}

export async function getUsage(
  connectorId: string,
  projectId: string = DEFAULT_PROJECT_ID,
): Promise<number> {
  if (!dbConfigured()) return mem.get(key(projectId, connectorId)) ?? 0;
  const { data } = await getSupabase()
    .from("cuotas")
    .select("used")
    .eq("project_id", projectId)
    .eq("connector_id", connectorId)
    .maybeSingle();
  return data?.used ?? 0;
}

export async function incrementUsage(
  connectorId: string,
  n = 1,
  projectId: string = DEFAULT_PROJECT_ID,
): Promise<number> {
  if (!dbConfigured()) {
    const k = key(projectId, connectorId);
    const v = (mem.get(k) ?? 0) + n;
    mem.set(k, v);
    return v;
  }
  // Atómico: RPC INSERT ... ON CONFLICT (project_id, connector_id) DO UPDATE
  // SET used = used + n RETURNING used (#10 STABILIZATION).
  const { data, error } = await getSupabase().rpc("increment_quota", {
    p_project_id: projectId,
    p_connector_id: connectorId,
    p_n: n,
  });
  if (error) throw error;
  return Number(data);
}

// Uso ORG-WIDE de un connector: suma `used` de todos los proyectos. Necesario
// porque las API keys son org-global pero la cuota se trackea por proyecto —
// el límite real del free tier (X/Resend) es compartido, así que el guard de
// la cola lo chequea además del per-project.
export async function getOrgUsage(connectorId: string): Promise<number> {
  if (!dbConfigured()) {
    let sum = 0;
    for (const [k, v] of mem) if (k.endsWith(`:${connectorId}`)) sum += v;
    return sum;
  }
  const { data } = await getSupabase()
    .from("cuotas")
    .select("used")
    .eq("connector_id", connectorId);
  return (data ?? []).reduce(
    (acc, r) => acc + ((r as { used?: number }).used ?? 0),
    0,
  );
}

export async function resetUsage(
  connectorId: string,
  projectId: string = DEFAULT_PROJECT_ID,
): Promise<void> {
  if (!dbConfigured()) {
    mem.set(key(projectId, connectorId), 0);
    return;
  }
  await getSupabase()
    .from("cuotas")
    .upsert(
      {
        project_id: projectId,
        connector_id: connectorId,
        used: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,connector_id" },
    );
}
