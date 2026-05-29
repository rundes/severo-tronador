// Campañas + cola de envío. Una campaña es una *vista* sobre contactos: se
// resuelve el segmento, se chequea cuota ANTES de enviar (§4.2), se respetan
// opt-outs y cooldowns, y se registra un envío por destinatario.
//
// F3: ejecución síncrona (sin Vercel Cron todavía) y store en memoria.
import { resendConnector } from "@/lib/connectors/resend";
import { metaWaCloudConnector } from "@/lib/connectors/meta-wa-cloud";
import { telnyxSmsConnector } from "@/lib/connectors/telnyx-sms";
import { telnyxVoiceConnector } from "@/lib/connectors/telnyx-voice";
import type { Contact, OutreachConnector } from "@/lib/connectors/types";
import { applySegment, loadContacts, type SegmentFilter } from "@/lib/segments";
import { applyQuery, type SegmentQuery } from "@/lib/segment-query";
import { channelAvailable, type Channel } from "@/lib/relationship";
import { getTemplate, interpolate } from "@/lib/templates";
import { interpolateExtended } from "@/lib/interpolate-vars";
import { createToken } from "@/lib/survey";
import { optedOutSet } from "@/lib/optout";
import { isEnabled } from "@/lib/connectors/config";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { enqueueSheetSync } from "@/lib/db/mirror";

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
}

function baseUrl(): string {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

// Pregunta por defecto si la campaña no define ninguna.
const DEFAULT_PREGUNTAS = ["¿Qué es lo que más te preocupa hoy de tu barrio?"];

// Cuerpo final: inyecta el link de encuesta y luego interpola variables.
function buildBody(cuerpo: string, contact: Contact, encuestaUrl: string): string {
  return interpolateExtended(cuerpo, contact, { surveyUrl: encuestaUrl });
}

// Dato de contacto que usa cada canal.
function destinoFor(channel: Channel, c: Contact): string {
  if (channel === "email") return c.email ?? "—";
  return c.telefono ?? "—"; // whatsapp, sms, voice
}

export type CampaignEstado = "enviada" | "encolada" | "enviando";

export interface Campaign {
  id: string;
  nombre: string;
  channel: Channel;
  templateId: string;
  // segmentFilter (flat) o segmentQuery (tree AND/OR/NOT). Solo uno está
  // seteado por campaña; el otro queda undefined. Storage como jsonb,
  // discriminado en runtime por isSegmentQuery().
  segmentFilter?: SegmentFilter;
  segmentQuery?: SegmentQuery;
  preguntas: string[];
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
  nombre: string;
  channel: Channel;
  template_id: string;
  // jsonb: SegmentFilter (flat) o SegmentQuery (tree). El runtime distingue
  // por presencia de `type: "group"`.
  segment_filter: SegmentFilter | SegmentQuery;
  preguntas: string[];
  estado: CampaignEstado;
  metrics: Campaign["metrics"];
  created_at: string;
}

// Fila en envio_queue (cola async). Una por destinatario sendable.
export interface EnvioQueueRow {
  id?: string;
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
  campaign_id: string;
  dni: string;
  nombre: string;
  destino: string;
  estado: Envio["estado"];
  reason: string | null;
  provider_message_id: string | null;
  delivery: NonNullable<Envio["delivery"]> | null;
  token: string | null;
  created_at: string;
}

function campaignToRow(c: Campaign): CampanaRow {
  return {
    id: c.id,
    nombre: c.nombre,
    channel: c.channel,
    template_id: c.templateId,
    // Si la campaña es query-based, persistimos el árbol; sino el filter.
    segment_filter: c.segmentQuery ?? c.segmentFilter ?? {},
    preguntas: c.preguntas,
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
    nombre: row.nombre,
    channel: row.channel,
    templateId: row.template_id,
    segmentFilter: isQuery ? undefined : (sf as SegmentFilter),
    segmentQuery: isQuery ? (sf as SegmentQuery) : undefined,
    preguntas: row.preguntas,
    createdAt: row.created_at,
    estado: row.estado,
    envios,
    metrics: row.metrics,
  };
}

function envioToRow(e: Envio, campaignId: string, createdAt: string): EnvioRow {
  return {
    campaign_id: campaignId,
    dni: e.dni,
    nombre: e.nombre,
    destino: e.destino,
    estado: e.estado,
    reason: e.reason ?? null,
    provider_message_id: e.providerMessageId ?? null,
    delivery: e.delivery ?? null,
    token: e.token ?? null,
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
  };
}

// La lista solo usa nombre/channel/createdAt/metrics, así que devolvemos las
// campañas con `envios: []` para evitar N+1 contra la tabla `envios`.
export async function listCampaigns(): Promise<Campaign[]> {
  if (!dbConfigured()) {
    return [...store].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const { data, error } = await getSupabase()
    .from("campanas")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as CampanaRow[]).map((row) => rowToCampaign(row, []));
}

export async function getCampaign(id: string): Promise<Campaign | undefined> {
  if (!dbConfigured()) return store.find((c) => c.id === id);

  const { data: campRow, error: campErr } = await getSupabase()
    .from("campanas")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (campErr) throw campErr;
  if (!campRow) return undefined;

  const { data: envioRows, error: envErr } = await getSupabase()
    .from("envios")
    .select("*")
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
};

export type ExecuteResult =
  | { ok: true; campaign: Campaign }
  | { ok: false; reason: "no_connector" | "no_template" }
  | { ok: false; reason: "quota_blocked"; needed: number; remaining: number };

export async function executeCampaign(
  input: ExecuteInput,
): Promise<ExecuteResult> {
  const connector = CONNECTOR_BY_CHANNEL[input.channel];
  if (!connector) return { ok: false, reason: "no_connector" };
  // No enviar por un conector desactivado desde el panel.
  if (!(await isEnabled(connector.id))) return { ok: false, reason: "no_connector" };

  const template = await getTemplate(input.templateId);
  if (!template) return { ok: false, reason: "no_template" };

  const campaignId = `cmp-${Date.now().toString(36)}`;
  const all = await loadContacts();
  const matched = input.segmentQuery
    ? applyQuery(all, input.segmentQuery)
    : applySegment(all, input.segmentFilter ?? {});

  // Opt-out global cross-channel: regla dura, se consulta ANTES de enviar.
  const opted = await optedOutSet();
  const optedOut = matched.filter((m) => opted.has(m.contact.dni));
  const rest = matched.filter((m) => !opted.has(m.contact.dni));

  // De los que quedan: disponibles en el canal (cooldown) vs. en cooldown.
  const sendable = rest.filter((m) => channelAvailable(m.rel, input.channel));
  const cooling = rest.filter((m) => !channelAvailable(m.rel, input.channel));

  // Chequeo de cuota ANTES de enviar. No hay "mandar igual".
  const { willFit, remaining } = await connector.estimateQuotaImpact(sendable.length);
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
      const token = await createToken(campaignId, m.contact.dni);
      const url = `${baseUrl()}/encuesta/${token}`;
      const result = await connector.send(
        {
          subject: template.asunto
            ? interpolate(template.asunto, m.contact)
            : undefined,
          body: buildBody(template.cuerpo, m.contact, url),
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
      });
    }
    const campaign: Campaign = {
      id: campaignId,
      nombre: input.nombre,
      channel: input.channel,
      templateId: input.templateId,
      segmentFilter: input.segmentFilter, segmentQuery: input.segmentQuery,
      preguntas,
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
  const queueRows: EnvioQueueRow[] = [];
  for (const m of sendable) {
    const token = await createToken(campaignId, m.contact.dni);
    const url = `${baseUrl()}/encuesta/${token}`;
    queueRows.push({
      campaign_id: campaignId,
      channel: input.channel,
      connector_id: connector.id,
      contact: m.contact,
      template: {
        subject: template.asunto
          ? interpolate(template.asunto, m.contact)
          : null,
        body: buildBody(template.cuerpo, m.contact, url),
      },
      token,
    });
  }

  const enqueued = queueRows.length;
  const campaign: Campaign = {
    id: campaignId,
    nombre: input.nombre,
    channel: input.channel,
    templateId: input.templateId,
    segmentFilter: input.segmentFilter, segmentQuery: input.segmentQuery,
    preguntas,
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
    const envioRows = envios.map((e) => envioToRow(e, campaign.id, createdAt));
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
