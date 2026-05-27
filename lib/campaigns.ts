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
import { isOptedOut } from "@/lib/optout";

export interface Envio {
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

type Store = Campaign[];
const g = globalThis as unknown as { __campaigns?: Store };
const store: Store = (g.__campaigns ??= []);

export function listCampaigns(): Campaign[] {
  return [...store].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getCampaign(id: string): Campaign | undefined {
  return store.find((c) => c.id === id);
}

// Actualiza el estado de entrega de un envío por providerMessageId. La invoca
// el webhook del provider (/api/webhooks/meta) al recibir delivered/read/failed.
export function updateEnvioStatus(
  providerMessageId: string,
  delivery: NonNullable<Envio["delivery"]>,
): boolean {
  for (const c of store) {
    const envio = c.envios.find((e) => e.providerMessageId === providerMessageId);
    if (envio) {
      envio.delivery = delivery;
      return true;
    }
  }
  return false;
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

  const template = getTemplate(input.templateId);
  if (!template) return { ok: false, reason: "no_template" };

  const campaignId = `cmp-${Date.now().toString(36)}`;
  const all = await loadContacts();
  const matched = applySegment(all, input.segmentFilter);

  // Opt-out global cross-channel: regla dura, se consulta ANTES de enviar.
  const optedOut = matched.filter((m) => isOptedOut(m.contact.dni));
  const rest = matched.filter((m) => !isOptedOut(m.contact.dni));

  // De los que quedan: disponibles en el canal (cooldown) vs. en cooldown.
  const sendable = rest.filter((m) => channelAvailable(m.rel, input.channel));
  const cooling = rest.filter((m) => !channelAvailable(m.rel, input.channel));

  // Chequeo de cuota ANTES de enviar. No hay "mandar igual".
  const { willFit, remaining } = connector.estimateQuotaImpact(sendable.length);
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
    const token = createToken(campaignId, m.contact.dni);
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
  store.push(campaign);
  return { ok: true, campaign };
}
