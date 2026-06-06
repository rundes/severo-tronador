// Audit log — registra acciones del usuario en el panel (Plan 02 F6).
// Memory fallback para dev sin Supabase.

import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { log } from "@/lib/logger";

export type AuditAction =
  | "campaign.create"
  | "campaign.executed"
  | "flow.create"
  | "flow.start"
  | "flow.delete"
  | "segment.save"
  | "segment.delete"
  | "template.create"
  | "template.test_send"
  | "connector.config"
  | "connector.toggle"
  | "listening.config"
  | "mailbox.provision"
  | "mailbox.send"
  | "mailbox.address.update"
  | "survey.create"
  | "survey.publish"
  | "survey.send"
  | "survey.delete"
  | "survey.responses_reset"
  | "group.create"
  | "group.assign"
  | "contact.create";

export interface AuditEntry {
  id: string;
  at: string;
  project_id?: string | null;
  actor: string | null;
  action: AuditAction;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
}

interface MemStore {
  __audit?: AuditEntry[];
}
const g = globalThis as unknown as MemStore;
const mem = (g.__audit ??= []);

export interface LogAuditInput {
  action: AuditAction;
  // Proyecto al que pertenece la acción. Opcional: si se omite, la columna
  // audit_log.project_id cae al DEFAULT (proyecto default) en Supabase. Los
  // call sites scopeados (Fase 3+) lo pasan explícito.
  projectId?: string;
  actor?: string | null;
  entity_type?: string;
  entity_id?: string;
  details?: Record<string, unknown>;
}

// Fire-and-forget — no bloquea la action si falla el log.
export async function logAudit(input: LogAuditInput): Promise<void> {
  const entry = {
    ...(input.projectId ? { project_id: input.projectId } : {}),
    actor: input.actor ?? null,
    action: input.action,
    entity_type: input.entity_type ?? null,
    entity_id: input.entity_id ?? null,
    details: input.details ?? {},
  };
  if (!dbConfigured()) {
    mem.push({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      ...entry,
    });
    return;
  }
  try {
    const { error } = await getSupabase().from("audit_log").insert(entry);
    if (error) {
      log.warn("audit.insert_failed", { error: error.message, action: input.action });
    }
  } catch (e) {
    log.warn("audit.exception", { msg: (e as Error).message });
  }
}

export interface ListAuditOptions {
  limit?: number;
  projectId?: string;
  action?: AuditAction;
  actor?: string;
}

export async function listAudit(
  opts: ListAuditOptions = {},
): Promise<AuditEntry[]> {
  const limit = opts.limit ?? 100;
  if (!dbConfigured()) {
    let out = [...mem];
    if (opts.projectId) out = out.filter((e) => e.project_id === opts.projectId);
    if (opts.action) out = out.filter((e) => e.action === opts.action);
    if (opts.actor) out = out.filter((e) => e.actor === opts.actor);
    return out
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, limit);
  }
  let q = getSupabase()
    .from("audit_log")
    .select("*")
    .order("at", { ascending: false })
    .limit(limit);
  if (opts.projectId) q = q.eq("project_id", opts.projectId);
  if (opts.action) q = q.eq("action", opts.action);
  if (opts.actor) q = q.eq("actor", opts.actor);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AuditEntry[];
}
