// Campañas + cola de envío. Una campaña es una *vista* sobre contactos: se
// resuelve el segmento, se chequea cuota ANTES de enviar (§4.2), se respetan
// opt-outs y cooldowns, y se registra un envío por destinatario.
//
// F3: ejecución síncrona (sin Vercel Cron todavía) y store en memoria.
import { resendConnector } from "@/lib/connectors/resend";
import type { OutreachConnector } from "@/lib/connectors/types";
import { applySegment, loadContacts, type SegmentFilter } from "@/lib/segments";
import { channelAvailable, type Channel } from "@/lib/relationship";
import { getTemplate, interpolate } from "@/lib/templates";

export interface Envio {
  dni: string;
  nombre: string;
  destino: string;
  estado: "sent" | "failed" | "skipped";
  reason?: string;
  providerMessageId?: string;
}

export interface Campaign {
  id: string;
  nombre: string;
  channel: Channel;
  templateId: string;
  segmentFilter: SegmentFilter;
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

// Solo email (Resend) en F3. Cada canal nuevo suma su conector acá.
const CONNECTOR_BY_CHANNEL: Partial<Record<Channel, OutreachConnector>> = {
  email: resendConnector,
};

export type ExecuteInput = {
  nombre: string;
  channel: Channel;
  templateId: string;
  segmentFilter: SegmentFilter;
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

  const all = await loadContacts();
  const matched = applySegment(all, input.segmentFilter);

  // Destinatarios efectivos: disponibles en el canal (cooldown + opt-out).
  const sendable = matched.filter((m) =>
    channelAvailable(m.rel, input.channel),
  );
  const blocked = matched.filter(
    (m) => !channelAvailable(m.rel, input.channel),
  );

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

  // Cooldown / opt-out → skipped.
  for (const m of blocked) {
    envios.push({
      dni: m.contact.dni,
      nombre: `${m.contact.nombre} ${m.contact.apellido}`,
      destino: m.contact.email ?? "—",
      estado: "skipped",
      reason: "cooldown u opt-out",
    });
  }

  // Envío real (o mock) a los disponibles.
  for (const m of sendable) {
    const result = await connector.send(
      {
        subject: template.asunto
          ? interpolate(template.asunto, m.contact)
          : undefined,
        body: interpolate(template.cuerpo, m.contact),
      },
      m.contact,
    );
    envios.push({
      dni: m.contact.dni,
      nombre: `${m.contact.nombre} ${m.contact.apellido}`,
      destino: m.contact.email ?? "—",
      estado: result.ok ? "sent" : "failed",
      reason: result.error,
      providerMessageId: result.providerMessageId,
    });
  }

  const campaign: Campaign = {
    id: `cmp-${Date.now().toString(36)}`,
    nombre: input.nombre,
    channel: input.channel,
    templateId: input.templateId,
    segmentFilter: input.segmentFilter,
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
