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
import { channelAvailable, type Channel } from "@/lib/relationship";
import { getTemplate, interpolate } from "@/lib/templates";
import { createToken } from "@/lib/survey";
import { optedOutSet } from "@/lib/optout";
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
  return interpolate(cuerpo.split("{{encuesta_url}}").join(encuestaUrl), contact);
}

// Dato de contacto que usa cada canal.
function destinoFor(channel: Channel, c: Contact): string {
  if (channel === "email") return c.email ?? "—";
  return c.telefono ?? "—"; // whatsapp, sms, voice
}

export interface Campaign {
  id: string;
  nombre: string;
  channel: Channel;
  templateId: string;
  segmentFilter: SegmentFilter;
  preguntas: string[];
  createdAt: string;
  estado: "enviada";
  envios: Envio[];
  metrics: { total: number; sent: number; failed: number; skipped: number };
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
  segment_filter: SegmentFilter;
  preguntas: string[];
  estado: Campaign["estado"];
  metrics: Campaign["metrics"];
  created_at: string;
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
    segment_filter: c.segmentFilter,
    preguntas: c.preguntas,
    estado: c.estado,
    metrics: c.metrics,
    created_at: c.createdAt,
  };
}

// Mapea una fila `campanas` → Campaign. `envios` se pasa aparte (vacío en la
// lista; poblado en getCampaign).
function rowToCampaign(row: CampanaRow, envios: Envio[]): Campaign {
  return {
    id: row.id,
    nombre: row.nombre,
    channel: row.channel,
    templateId: row.template_id,
    segmentFilter: row.segment_filter,
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
  segmentFilter: SegmentFilter;
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

  const template = await getTemplate(input.templateId);
  if (!template) return { ok: false, reason: "no_template" };

  const campaignId = `cmp-${Date.now().toString(36)}`;
  const all = await loadContacts();
  const matched = applySegment(all, input.segmentFilter);

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

  // Envío real (o mock) a los disponibles, cada uno con su token de encuesta.
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
    segmentFilter: input.segmentFilter,
    preguntas:
      input.preguntas && input.preguntas.length
        ? input.preguntas
        : DEFAULT_PREGUNTAS,
    createdAt: new Date().toISOString(),
    estado: "enviada",
    envios,
    metrics: {
      total: envios.length,
      sent: envios.filter((e) => e.estado === "sent").length,
      failed: envios.filter((e) => e.estado === "failed").length,
      skipped: envios.filter((e) => e.estado === "skipped").length,
    },
  };
  if (!dbConfigured()) {
    store.push(campaign);
    return { ok: true, campaign };
  }

  // Persistencia en Supabase: fila `campanas` (sin `envios`) + N filas `envios`.
  const campanaRow = campaignToRow(campaign);
  const { error: campErr } = await getSupabase()
    .from("campanas")
    .insert(campanaRow);
  if (campErr) throw campErr;
  await enqueueSheetSync("campanas", "upsert", campanaRow);

  if (envios.length) {
    const envioRows = envios.map((e) =>
      envioToRow(e, campaign.id, campaign.createdAt),
    );
    const { error: envErr } = await getSupabase().from("envios").insert(envioRows);
    if (envErr) throw envErr;
    for (const row of envioRows) {
      await enqueueSheetSync("envios", "upsert", row);
    }
  }

  return { ok: true, campaign };
}
