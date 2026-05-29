// Estimación de costo por canal para una audiencia dada (Plan 02 — F1.6).
// Pulled desde connector.estimateQuotaImpact() (ya existente) + costo por
// unidad declarado en capabilities[*].costPerUnit (USD).
//
// Modelo simple: cost = max(0, count - free_remaining) × cost_per_unit.
// Voice tiene unidades = "minutes", asumimos 2 min/llamada para estimar.
import { outreachConnectorFor, OUTREACH_CHANNELS } from "@/lib/campaigns";
import type { Channel } from "@/lib/relationship";

const VOICE_MINUTES_PER_CALL = 2;

// Connectors con free tier real: cost solo cuando se supera. Los demás
// (telnyx-sms, telnyx-voice) cobran por unidad desde la primera; el limit
// de la quota es un guardarraíl de gasto, no un free tier.
const FREE_TIER_IDS = new Set<string>(["resend", "meta-wa-cloud"]);

export interface ChannelCost {
  channel: Channel;
  count: number; // contactos a enviar
  willFit: boolean; // cabe en free tier
  remaining: number; // unidades libres antes de pagar
  paidUnits: number; // unidades que pagaríamos
  costPerUnit: number; // USD por unidad (sacado de capability)
  estUsd: number; // costo estimado total
  unit: string; // ej "messages", "minutes"
}

export async function estimateAllChannels(count: number): Promise<ChannelCost[]> {
  const out: ChannelCost[] = [];
  for (const channel of OUTREACH_CHANNELS) {
    const connector = outreachConnectorFor(channel);
    if (!connector) continue;
    const { willFit, remaining } = await connector.estimateQuotaImpact(count);
    const quota = await connector.getQuota();
    // El primer capability con costPerUnit declarado sirve como precio guide.
    const cap = connector.capabilities.find((c) => c.costPerUnit != null);
    const costPerUnit = cap?.costPerUnit ?? 0;
    const isVoice = channel === "voice";
    const consumedUnits = isVoice ? count * VOICE_MINUTES_PER_CALL : count;
    const paidUnits = FREE_TIER_IDS.has(connector.id)
      ? Math.max(0, consumedUnits - Math.max(0, remaining))
      : consumedUnits;
    const estUsd = paidUnits * costPerUnit;
    out.push({
      channel,
      count,
      willFit,
      remaining,
      paidUnits,
      costPerUnit,
      estUsd,
      unit: quota.unit,
    });
  }
  return out;
}
