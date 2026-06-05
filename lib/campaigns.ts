// Campañas + cola de envío. Una campaña es una *vista* sobre contactos: se
// resuelve el segmento, se chequea cuota ANTES de enviar (§4.2), se respetan
// opt-outs y cooldowns, y se registra un envío por destinatario.
//
// F3: ejecución síncrona (sin Vercel Cron todavía) y store en memoria.
import { resendConnector } from "@/lib/connectors/resend";
import { metaWaCloudConnector } from "@/lib/connectors/meta-wa-cloud";
import { telnyxSmsConnector } from "@/lib/connectors/telnyx-sms";
import { telnyxVoiceConnector } from "@/lib/connectors/telnyx-voice";
import { telegramBotConnector } from "@/lib/connectors/telegram-bot";
import type { Contact, OutreachConnector } from "@/lib/connectors/types";
import { applySegment, loadContacts, type SegmentFilter } from "@/lib/segments";
import { applyQuery, type SegmentQuery } from "@/lib/segment-query";
import { channelAvailable, type Channel } from "@/lib/relationship";
import { getTemplate, interpolate } from "@/lib/templates";
import { interpolateExtended } from "@/lib/interpolate-vars";
import { renderCampaignEmailHtml, type EmailTemplateInput } from "@/lib/email-render";
import { createToken } from "@/lib/survey";
import { trackedLink, openPixel } from "@/lib/tracking";
import { pickVariant, type Variant } from "@/lib/ab-test";
import { optedOutSet } from "@/lib/optout";
import { isEnabled } from "@/lib/connectors/config";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { enqueueSheetSync } from "@/lib/db/mirror";
import { buildReplyTo, isRepliesConfigured } from "@/lib/mailbox/reply-address";

export interface Envio {
  // PK uuid en la tabla `envios`; opcional porque el fallback en memoria no lo usa.
  id?: string;
  dni: string;
  nombre: string;
  destino: string;
  estado: "sent" | "failed" | "skipped";
  reason?: string;
  providerMessageId?: string;
  // Token de encuesta (F6): abre /encuesta/[token].
  token?: string;
  // Estado de entrega que llega por webhook del provider (F4+).
  delivery?: "delivered" | "read" | "failed";
  // A/B testing: id de la variante con la que se envió (F5).
  variantId?: string;
}

function baseUrl(): string {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

// Pregunta por defecto si la campaña no define ninguna.
const DEFAULT_PREGUNTAS = ["¿Qué es lo que más te preocupa hoy de tu barrio?"];

// Cuerpo final. Para canales no-email: texto plano interpolado. Para email:
// HTML de marca (texto→HTML o HTML del editor sanitizado), con el link de
// encuesta rastreado y el pixel de apertura inyectado al final.
function buildBody(
  tpl: EmailTemplateInput,
  contact: Contact,
  encuestaUrl: string,
  token: string,
  channel: Channel,
): string {
  if (channel !== "email") {
    return interpolateExtended(tpl.cuerpo, contact, { surveyUrl: encuestaUrl });
  }
  const base = baseUrl();
  return renderCampaignEmailHtml(tpl, contact, {
    surveyUrl: trackedLink(base, token, encuestaUrl),
    trailingHtml: openPixel(base, token),
  });
}

// Dato de contacto que usa cada canal.
function destinoFor(channel: Channel, c: Contact): string {
  if (channel === "email") return c.email ?? "—";
  return c.telefono ?? "—"; // whatsapp, sms, voice
}

export type CampaignEstado = "enviada" | "encolada" | "enviando";

export interface Campaign {
  id: string;
  projectId: string;
  nombre: string;
  channel: Channel;
  templateId: string;
  // segmentFilter (flat) o segmentQuery (tree AND/OR/NOT). Solo uno está
  // seteado por campaña; el otro queda undefined. Storage como jsonb,
  // discriminado en runtime por isSegmentQuery().
  segmentFilter?: SegmentFilter;
  segmentQuery?: SegmentQuery;
  // A/B testing (F5): si está vacío, single variant (usa templateId).
  // Si tiene 2+, executeCampaign hace pickVariant per destinatario y
  // persiste variant_id en envios.
  variants: Variant[];
  preguntas: string[];
  // Si la campaña distribuye una encuesta del módulo nuevo, su id. Los tokens
  // creados resuelven a esa encuesta (atribución por destinatario).
  encuestaId?: string;
  createdAt: string;
  estado: CampaignEstado;
  envios: Envio[];
  metrics: {
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    enqueued?: number;
  };
}

// --- Fallback en memoria (sin Supabase) ---
type Store = Campaign[];
const g = globalThis as unknown as { __campaigns?: Store };
const store: Store = (g.__campaigns ??= []);

// --- Row shapes en Supabase (snake_case) ---
// `campanas` guarda TODO menos `envios` (que vive en su propia tabla y se
// deriva en getCampaign). Se usa Supabase directo (no el generic repo) para
// mapear camelCase↔snake_case explícitamente, igual que survey.ts.
interface CampanaRow {
  id: string;
  project_id: string;
  nombre: string;
  channel: Channel;
  template_id: string;
  // jsonb: SegmentFilter (flat) o SegmentQuery (tree). El runtime distingue
  // por presencia de `type: "group"`.
  segment_filter: SegmentFilter | SegmentQuery;
  variants: Variant[];
  preguntas: string[];
  encuesta_id?: string | null;
  estado: CampaignEstado;
  metrics: Campaign["metrics"];
  created_at: string;
}

// Fila en envio_queue (cola async). Una por destinatario sendable.
export interface EnvioQueueRow {
  id?: string;
  project_id: string;
  campaign_id: string;
  channel: Channel;
  connector_id: string;
  contact: Contact;
  template: { subject: string | null; body: string };
  token: string;
  status?: "pending" | "done" | "failed";
  attempts?: number;
  last_error?: string | null;
  provider_message_id?: string | null;
  scheduled_at?: string | null;
  processed_at?: string | null;
  created_at?: string;
}

interface EnvioRow {
  id?: string;
  project_id: string;
  campaign_id: string;
  dni: string;
  nombre: string;
  destino: string;
  estado: Envio["estado"];
  reason: string | null;
  provider_message_id: string | null;
  delivery: NonNullable<Envio["delivery"]> | null;
  token: string | null;
  variant_id: string | null;
  created_at: string;
}

function campaignToRow(c: Campaign): CampanaRow {
  return {
    id: c.id,
    project_id: c.projectId,
    nombre: c.nombre,
    channel: c.channel,
    template_id: c.templateId,
    // Si la campaña es query-based, persistimos el árbol; sino el filter.
    segment_filter: c.segmentQuery ?? c.segmentFilter ?? {},
    variants: c.variants ?? [],
    preguntas: c.preguntas,
    encuesta_id: c.encuestaId ?? null,
    estado: c.estado,
    metrics: c.metrics,
    created_at: c.createdAt,
  };
}

// Mapea una fila `campanas` → Campaign. `envios` se pasa aparte (vacío en la
// lista; poblado en getCampaign).
function rowToCampaign(row: CampanaRow, envios: Envio[]): Campaign {
  const sf = row.segment_filter;
  const isQuery = typeof sf === "object" && sf !== null && (sf as { type?: string }).type === "group";
  return {
    id: row.id,
    projectId: row.project_id,
    nombre: row.nombre,
    channel: row.channel,
    templateId: row.template_id,
    segmentFilter: isQuery ? undefined : (sf as SegmentFilter),
    segmentQuery: isQuery ? (sf as SegmentQuery) : undefined,
    variants: Array.isArray(row.variants) ? row.variants : [],
    preguntas: row.preguntas,
    encuestaId: row.encuesta_id ?? undefined,
    createdAt: row.created_at,
    estado: row.estado,
    envios,
    metrics: row.metrics,
  };
}

function envioToRow(
  e: Envio,
  projectId: string,
  campaignId: string,
  createdAt: string,
): EnvioRow {
  return {
    project_id: projectId,
    campaign_id: campaignId,
    dni: e.dni,
    nombre: e.nombre,
    destino: e.destino,
    estado: e.estado,
    reason: e.reason ?? null,
    provider_message_id: e.providerMessageId ?? null,
    delivery: e.delivery ?? null,
    token: e.token ?? null,
    variant_id: e.variantId ?? null,
    created_at: createdAt,
  };
}

function rowToEnvio(row: EnvioRow): Envio {
  return {
    id: row.id,
    dni: row.dni,
    nombre: row.nombre,
    destino: row.destino,
    estado: row.estado,
    reason: row.reason ?? undefined,
    providerMessageId: row.provider_message_id ?? undefined,
    token: row.token ?? undefined,
    delivery: row.delivery ?? undefined,
    variantId: row.variant_id ?? undefined,
  };
}

// La lista solo usa nombre/channel/createdAt/metrics, así que devolvemos las
// campañas con `envios: []` para evitar N+1 contra la tabla `envios`.
export async function listCampaigns(projectId: string): Promise<Campaign[]> {
  if (!dbConfigured()) {
    return [...store]
      .filter((c) => c.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const { data, error } = await getSupabase()
    .from("campanas")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as CampanaRow[]).map((row) => rowToCampaign(row, []));
}

export async function getCampaign(
  projectId: string,
  id: string,
): Promise<Campaign | undefined> {
  if (!dbConfigured())
    return store.find((c) => c.id === id && c.projectId === projectId);

  const { data: campRow, error: campErr } = await getSupabase()
    .from("campanas")
    .select("*")
    .eq("id", id)
    .eq("project_id", projectId)
    .maybeSingle();
  if (campErr) throw campErr;
  if (!campRow) return undefined;

  const { data: envioRows, error: envErr } = await getSupabase()
    .from("envios")
    .select("*")
    .eq("project_id", projectId)
    .eq("campaign_id", id)
    .order("created_at", { ascending: true });
  if (envErr) throw envErr;

  const envios = (envioRows as EnvioRow[]).map(rowToEnvio);
  return rowToCampaign(campRow as CampanaRow, envios);
}

// Actualiza el estado de entrega de un envío por providerMessageId. La invoca
// el webhook del provider (/api/webhooks/meta) al recibir delivered/read/failed.
export async function updateEnvioStatus(
  providerMessageId: string,
  delivery: NonNullable<Envio["delivery"]>,
): Promise<boolean> {
  if (!dbConfigured()) {
    for (const c of store) {
      const envio = c.envios.find(
        (e) => e.providerMessageId === providerMessageId,
      );
      if (envio) {
        envio.delivery = delivery;
        return true;
      }
    }
    return false;
  }

  const { data, error } = await getSupabase()
    .from("envios")
    .update({ delivery })
    .eq("provider_message_id", providerMessageId)
    .select("id");
  if (error) throw error;
  return Boolean(data && data.length > 0);
}

// Mapeo canal → conector. Cada canal nuevo suma su conector acá.
const CONNECTOR_BY_CHANNEL: Partial<Record<Channel, OutreachConnector>> = {
  email: resendConnector,
  whatsapp: metaWaCloudConnector,
  sms: telnyxSmsConnector,
  voice: telnyxVoiceConnector,
  telegram: telegramBotConnector,
};

export function outreachConnectorFor(
  channel: Channel,
): OutreachConnector | undefined {
  return CONNECTOR_BY_CHANNEL[channel];
}

export const OUTREACH_CHANNELS = Object.keys(CONNECTOR_BY_CHANNEL) as Channel[];

export type ExecuteInput = {
  nombre: string;
  channel: Channel;
  templateId: string;
  // Exactamente uno debe estar seteado. Si vienen ambos gana segmentQuery.
  segmentFilter?: SegmentFilter;
  segmentQuery?: SegmentQuery;
  preguntas?: string[];
  // Distribuir una encuesta del módulo nuevo: los tokens resuelven a ella.
  encuestaId?: string;
  // A/B testing: si trae 2+ variantes, executeCampaign hace pickVariant
  // por destinatario. Cada variante apunta a su propio template_id (puede
  // ser el mismo templateId del input para una variante baseline).
  variants?: Variant[];
};

export type ExecuteResult =
  | { ok: true; campaign: Campaign }
  | { ok: false; reason: "no_connector" | "no_template" }
  | { ok: false; reason: "quota_blocked"; needed: number; remaining: number };

export async function executeCampaign(
  projectId: string,
  input: ExecuteInput,
): Promise<ExecuteResult> {
  const connector = CONNECTOR_BY_CHANNEL[input.channel];
  if (!connector) return { ok: false, reason: "no_connector" };
  // No enviar por un conector desactivado desde el panel.
  if (!(await isEnabled(connector.id))) return { ok: false, reason: "no_connector" };

  const baseTemplate = await getTemplate(input.templateId);
  if (!baseTemplate) return { ok: false, reason: "no_template" };
  type Tpl = NonNullable<typeof baseTemplate>;
  const safeBase: Tpl = baseTemplate;

  // A/B testing: resolver templates de cada variante. Mismo input.templateId
  // sirve como baseline si la variante no lo override. Si alguna variante
  // referencia un template_id que no existe → fallar antes de tocar nada.
  const variants = input.variants ?? [];
  const variantTemplates = new Map<string, Tpl>();
  variantTemplates.set(input.templateId, safeBase);
  for (const v of variants) {
    if (!variantTemplates.has(v.template_id)) {
      const t = await getTemplate(v.template_id);
      if (!t) return { ok: false, reason: "no_template" };
      variantTemplates.set(v.template_id, t);
    }
  }

  const campaignId = `cmp-${Date.now().toString(36)}`;
  const all = await loadContacts(projectId);

  // Helper local: resuelve template + variantId para un contacto.
  function resolveFor(dni: string): { tpl: Tpl; variantId?: string } {
    if (variants.length === 0) return { tpl: safeBase };
    const v = pickVariant(variants, dni, campaignId);
    if (!v) return { tpl: safeBase };
    return { tpl: variantTemplates.get(v.template_id) ?? safeBase, variantId: v.id };
  }
  const matched = input.segmentQuery
    ? applyQuery(all, input.segmentQuery)
    : applySegment(all, input.segmentFilter ?? {});

  // Opt-out global cross-channel: regla dura, se consulta ANTES de enviar.
  const opted = await optedOutSet(projectId);
  const optedOut = matched.filter((m) => opted.has(m.contact.dni));
  const rest = matched.filter((m) => !opted.has(m.contact.dni));

  // De los que quedan: disponibles en el canal (cooldown) vs. en cooldown.
  const sendable = rest.filter((m) => channelAvailable(m.rel, input.channel));
  const cooling = rest.filter((m) => !channelAvailable(m.rel, input.channel));

  // Chequeo de cuota ANTES de enviar. No hay "mandar igual".
  const { willFit, remaining } = await connector.estimateQuotaImpact(
    sendable.length,
    projectId,
  );
  if (!willFit) {
    return {
      ok: false,
      reason: "quota_blocked",
      needed: sendable.length,
      remaining,
    };
  }

  const envios: Envio[] = [];

  for (const m of optedOut) {
    envios.push({
      dni: m.contact.dni,
      nombre: `${m.contact.nombre} ${m.contact.apellido}`,
      destino: destinoFor(input.channel, m.contact),
      estado: "skipped",
      reason: "opt-out global",
    });
  }
  for (const m of cooling) {
    envios.push({
      dni: m.contact.dni,
      nombre: `${m.contact.nombre} ${m.contact.apellido}`,
      destino: destinoFor(input.channel, m.contact),
      estado: "skipped",
      reason: "cooldown",
    });
  }

  const preguntas =
    input.preguntas && input.preguntas.length
      ? input.preguntas
      : DEFAULT_PREGUNTAS;
  const createdAt = new Date().toISOString();

  // ── Memory path (dev, sin Supabase): envío inline síncrono.
  if (!dbConfigured()) {
    for (const m of sendable) {
      const { tpl, variantId } = resolveFor(m.contact.dni);
      const token = await createToken(projectId, campaignId, m.contact.dni, input.encuestaId);
      const url = `${baseUrl()}/encuesta/${token}`;
      const result = await connector.send(
        {
          subject: tpl.asunto ? interpolate(tpl.asunto, m.contact) : undefined,
          body: buildBody(tpl, m.contact, url, token, input.channel),
          replyTo: isRepliesConfigured() ? buildReplyTo(token) : undefined,
        },
        m.contact,
      );
      envios.push({
        dni: m.contact.dni,
        nombre: `${m.contact.nombre} ${m.contact.apellido}`,
        destino: destinoFor(input.channel, m.contact),
        estado: result.ok ? "sent" : "failed",
        reason: result.error,
        providerMessageId: result.providerMessageId,
        token,
        variantId,
      });
    }
    const campaign: Campaign = {
      id: campaignId,
      projectId,
      nombre: input.nombre,
      channel: input.channel,
      templateId: input.templateId,
      segmentFilter: input.segmentFilter,
      segmentQuery: input.segmentQuery,
      variants,
      preguntas,
      encuestaId: input.encuestaId,
      createdAt,
      estado: "enviada",
      envios,
      metrics: {
        total: envios.length,
        sent: envios.filter((e) => e.estado === "sent").length,
        failed: envios.filter((e) => e.estado === "failed").length,
        skipped: envios.filter((e) => e.estado === "skipped").length,
      },
    };
    store.push(campaign);
    return { ok: true, campaign };
  }

  // ── DB path: encolar sendable en envio_queue. El cron
  // /api/cron/send-queue procesa async respetando rate limit por provider.
  const queueRows: (EnvioQueueRow & { variant_id?: string | null })[] = [];
  for (const m of sendable) {
    const { tpl, variantId } = resolveFor(m.contact.dni);
    const token = await createToken(projectId, campaignId, m.contact.dni, input.encuestaId);
    const url = `${baseUrl()}/encuesta/${token}`;
    queueRows.push({
      project_id: projectId,
      campaign_id: campaignId,
      channel: input.channel,
      connector_id: connector.id,
      contact: m.contact,
      template: {
        subject: tpl.asunto ? interpolate(tpl.asunto, m.contact) : null,
        body: buildBody(tpl, m.contact, url, token, input.channel),
      },
      token,
      variant_id: variantId ?? null,
    });
  }

  const enqueued = queueRows.length;
  const campaign: Campaign = {
    id: campaignId,
    projectId,
    nombre: input.nombre,
    channel: input.channel,
    templateId: input.templateId,
    segmentFilter: input.segmentFilter,
    segmentQuery: input.segmentQuery,
    variants,
    preguntas,
    encuestaId: input.encuestaId,
    createdAt,
    // Si no hay nada que encolar (todo opted-out o cooling), termina ya.
    estado: enqueued > 0 ? "encolada" : "enviada",
    envios,
    metrics: {
      total: envios.length + enqueued,
      sent: 0,
      failed: 0,
      skipped: envios.length,
      enqueued,
    },
  };

  const campanaRow = campaignToRow(campaign);
  const { error: campErr } = await getSupabase()
    .from("campanas")
    .insert(campanaRow);
  if (campErr) throw campErr;
  await enqueueSheetSync("campanas", "upsert", campanaRow);

  // Persistir los skipped (opt-out + cooldown) en envios. Las filas reales
  // (sent/failed) las crea el cron al despachar el queue.
  if (envios.length) {
    const envioRows = envios.map((e) =>
      envioToRow(e, projectId, campaign.id, createdAt),
    );
    const { error: envErr } = await getSupabase().from("envios").insert(envioRows);
    if (envErr) throw envErr;
    for (const row of envioRows) {
      await enqueueSheetSync("envios", "upsert", row);
    }
  }

  // Encolar para envío async. Batches de 500 por límite de Supabase REST.
  for (let i = 0; i < queueRows.length; i += 500) {
    const batch = queueRows.slice(i, i + 500);
    const { error: qErr } = await getSupabase()
      .from("envio_queue")
      .insert(batch);
    if (qErr) throw qErr;
  }

  return { ok: true, campaign };
}
