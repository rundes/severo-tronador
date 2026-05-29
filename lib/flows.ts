// Drip flows — secuencias multi-step (Plan 02 F3). Una flow define un
// segmento + lista ordenada de steps; cada step ejecuta en step.delay_days
// desde startFlow. Conditional steps skipean según respuestas previas.
//
// Persistencia: tablas `flows` + `flow_steps` (migration 0006).
// Memory fallback en globalThis para dev sin Supabase.

import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { applySegment, loadContacts, type SegmentFilter } from "@/lib/segments";
import { applyQuery, type SegmentQuery, isSegmentQuery } from "@/lib/segment-query";
import { interpolate, getTemplate } from "@/lib/templates";
import { createToken } from "@/lib/survey";
import { optedOutSet } from "@/lib/optout";
import { outreachConnectorFor } from "@/lib/campaigns";
import { isEnabled } from "@/lib/connectors/config";
import type { Channel } from "@/lib/relationship";
import type { Contact } from "@/lib/connectors/types";
import { log } from "@/lib/logger";

export type FlowEstado = "draft" | "running" | "completed" | "cancelled";

export type ConditionKind =
  | "always"
  | "if_no_response_to_prev"
  | "if_response_to_prev";

export interface FlowStep {
  id?: string;
  flow_id?: string;
  position: number;
  delay_days: number;
  channel: Channel;
  template_id: string;
  condition_kind: ConditionKind;
}

export interface Flow {
  id: string;
  nombre: string;
  segment_filter: SegmentFilter | SegmentQuery;
  estado: FlowEstado;
  metrics: { enqueued?: number; skipped?: number };
  created_by: string | null;
  created_at: string;
  started_at: string | null;
  steps: FlowStep[];
}

interface MemStore {
  __flows?: Flow[];
}

const g = globalThis as unknown as MemStore;
const mem = (g.__flows ??= []);

function baseUrl(): string {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

function buildBody(cuerpo: string, contact: Contact, encuestaUrl: string): string {
  return interpolate(cuerpo.split("{{encuesta_url}}").join(encuestaUrl), contact);
}

// ── CRUD ──────────────────────────────────────────────────────────────────

export async function listFlows(): Promise<Flow[]> {
  if (!dbConfigured()) {
    return [...mem].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const db = getSupabase();
  const { data, error } = await db
    .from("flows")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const flows: Flow[] = [];
  for (const row of (data ?? []) as Omit<Flow, "steps">[]) {
    const { data: steps } = await db
      .from("flow_steps")
      .select("*")
      .eq("flow_id", row.id)
      .order("position");
    flows.push({ ...row, steps: (steps ?? []) as FlowStep[] });
  }
  return flows;
}

export async function getFlow(id: string): Promise<Flow | undefined> {
  if (!dbConfigured()) return mem.find((f) => f.id === id);
  const db = getSupabase();
  const { data, error } = await db
    .from("flows")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  const { data: steps } = await db
    .from("flow_steps")
    .select("*")
    .eq("flow_id", id)
    .order("position");
  return { ...(data as Omit<Flow, "steps">), steps: (steps ?? []) as FlowStep[] };
}

export interface CreateFlowInput {
  nombre: string;
  segment_filter: SegmentFilter | SegmentQuery;
  steps: Omit<FlowStep, "id" | "flow_id">[];
  created_by?: string;
}

export async function createFlow(input: CreateFlowInput): Promise<Flow> {
  if (!dbConfigured()) {
    const flow: Flow = {
      id: crypto.randomUUID(),
      nombre: input.nombre,
      segment_filter: input.segment_filter,
      estado: "draft",
      metrics: {},
      created_by: input.created_by ?? null,
      created_at: new Date().toISOString(),
      started_at: null,
      steps: input.steps.map((s, i) => ({ ...s, position: i })),
    };
    mem.push(flow);
    return flow;
  }
  const db = getSupabase();
  const { data: flowRow, error: e1 } = await db
    .from("flows")
    .insert({
      nombre: input.nombre,
      segment_filter: input.segment_filter,
      created_by: input.created_by ?? null,
    })
    .select()
    .single();
  if (e1) throw e1;
  const steps = input.steps.map((s, i) => ({
    flow_id: flowRow.id as string,
    position: i,
    delay_days: s.delay_days,
    channel: s.channel,
    template_id: s.template_id,
    condition_kind: s.condition_kind,
  }));
  if (steps.length > 0) {
    const { error: e2 } = await db.from("flow_steps").insert(steps);
    if (e2) throw e2;
  }
  return {
    ...(flowRow as Omit<Flow, "steps">),
    steps: steps.map((s) => ({ ...s })),
  };
}

export async function deleteFlow(id: string): Promise<void> {
  if (!dbConfigured()) {
    const idx = mem.findIndex((f) => f.id === id);
    if (idx >= 0) mem.splice(idx, 1);
    return;
  }
  // ON DELETE CASCADE limpia flow_steps; envio_queue.flow_id queda null.
  const { error } = await getSupabase().from("flows").delete().eq("id", id);
  if (error) throw error;
}

// ── Ejecución ─────────────────────────────────────────────────────────────

export type StartFlowResult =
  | { ok: true; flow: Flow; enqueued: number }
  | { ok: false; reason: "no_flow" | "no_steps" | "already_running" | "no_db" }
  | { ok: false; reason: "step_missing_template"; step: number }
  | { ok: false; reason: "step_no_connector"; step: number };

export async function startFlow(flowId: string): Promise<StartFlowResult> {
  if (!dbConfigured()) return { ok: false, reason: "no_db" };
  const flow = await getFlow(flowId);
  if (!flow) return { ok: false, reason: "no_flow" };
  if (flow.estado === "running") return { ok: false, reason: "already_running" };
  if (flow.steps.length === 0) return { ok: false, reason: "no_steps" };

  // Validar steps antes de enqueue: template existe, conector existe + enabled.
  for (const step of flow.steps) {
    const template = await getTemplate(step.template_id);
    if (!template) return { ok: false, reason: "step_missing_template", step: step.position };
    const connector = outreachConnectorFor(step.channel);
    if (!connector || !(await isEnabled(connector.id)))
      return { ok: false, reason: "step_no_connector", step: step.position };
  }

  // Resolver audiencia (segment_filter o segment_query).
  const all = await loadContacts();
  const matched = isSegmentQuery(flow.segment_filter)
    ? applyQuery(all, flow.segment_filter as SegmentQuery)
    : applySegment(all, flow.segment_filter as SegmentFilter);

  // Opt-out global. Cooldown se evalúa cuando el cron despacha cada step.
  const opted = await optedOutSet();
  const audience = matched.filter((m) => !opted.has(m.contact.dni));

  const db = getSupabase();
  const startedAt = Date.now();
  const queueRows: Record<string, unknown>[] = [];

  for (const step of flow.steps) {
    const template = await getTemplate(step.template_id);
    if (!template) continue; // ya validado arriba
    const connector = outreachConnectorFor(step.channel)!;
    const scheduledAt = new Date(startedAt + step.delay_days * 86400000).toISOString();
    for (const m of audience) {
      const token = await createToken(flow.id, m.contact.dni);
      const url = `${baseUrl()}/encuesta/${token}`;
      queueRows.push({
        campaign_id: `flow-${flow.id}`,
        channel: step.channel,
        connector_id: connector.id,
        contact: m.contact,
        template: {
          subject: template.asunto
            ? interpolate(template.asunto, m.contact)
            : null,
          body: buildBody(template.cuerpo, m.contact, url),
        },
        token,
        scheduled_at: scheduledAt,
        flow_id: flow.id,
        flow_step_position: step.position,
        condition_kind: step.condition_kind,
      });
    }
  }

  for (let i = 0; i < queueRows.length; i += 500) {
    const batch = queueRows.slice(i, i + 500);
    const { error } = await db.from("envio_queue").insert(batch);
    if (error) throw error;
  }

  await db
    .from("flows")
    .update({
      estado: "running",
      started_at: new Date(startedAt).toISOString(),
      metrics: { enqueued: queueRows.length, skipped: 0 },
    })
    .eq("id", flow.id);

  log.info("flow.started", {
    flow_id: flow.id,
    audience: audience.length,
    steps: flow.steps.length,
    enqueued: queueRows.length,
  });

  return { ok: true, flow: { ...flow, estado: "running" }, enqueued: queueRows.length };
}

// ── Evaluación de condiciones (usada por el cron) ────────────────────────
// Para un envio que el cron está por despachar: ¿la condición permite el
// disparo, o hay que skipearlo?

export interface ConditionContext {
  flow_id: string;
  contact_dni: string;
  step_position: number;
  condition_kind: ConditionKind;
}

export async function shouldDispatch(ctx: ConditionContext): Promise<boolean> {
  if (ctx.condition_kind === "always") return true;
  if (!dbConfigured()) return true;

  const db = getSupabase();
  // Tokens de pasos previos del mismo flow + contacto.
  const { data: prevQueue } = await db
    .from("envio_queue")
    .select("token, status")
    .eq("flow_id", ctx.flow_id)
    .eq("contact->>dni", ctx.contact_dni)
    .lt("flow_step_position", ctx.step_position);
  const prevTokens = ((prevQueue ?? []) as { token: string; status: string }[])
    .filter((r) => r.status === "done")
    .map((r) => r.token);
  if (prevTokens.length === 0) {
    // Sin pasos previos done: "if_response" no se cumple, "if_no_response"
    // tampoco tiene sentido. Para conservar semántica: skip si conditional.
    return false;
  }
  const { data: resps } = await db
    .from("respuestas")
    .select("token")
    .in("token", prevTokens);
  const hasResponse = (resps ?? []).length > 0;
  if (ctx.condition_kind === "if_response_to_prev") return hasResponse;
  if (ctx.condition_kind === "if_no_response_to_prev") return !hasResponse;
  return true;
}
