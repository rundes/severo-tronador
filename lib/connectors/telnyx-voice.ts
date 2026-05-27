// Conector de voz/IVR: Telnyx. Categoría `outreach`.
// Llamada saliente automática (encuesta IVR): el cuerpo del mensaje es el
// guion TTS. Pago (~$0.004/min). Tope mensual de llamadas como guardarraíl.
// Sin TELNYX_API_KEY → mock. (Para encuestas conversacionales con IA ver el
// conector bland-ai, F5+.)
import type {
  ConnectorStatus,
  Contact,
  OutreachConnector,
  OutreachMessage,
  Quota,
  SendResult,
  TestResult,
} from "./types";
import { getUsage, incrementUsage, nextMonthlyReset } from "@/lib/quota";

const ID = "telnyx-voice";

function monthlyCap(): number {
  const v = Number(process.env.TELNYX_VOICE_MONTHLY_CAP);
  return Number.isFinite(v) && v > 0 ? v : 500;
}

function hasCreds(): boolean {
  return Boolean(process.env.TELNYX_API_KEY && process.env.TELNYX_VOICE_CONNECTION_ID);
}

export const telnyxVoiceConnector: OutreachConnector = {
  id: ID,
  name: "Telnyx Voz / IVR",
  vendor: "Telnyx LLC",
  category: "outreach",
  description: "Llamada IVR automática (~$0.004/min). Tope mensual de llamadas.",
  docsUrl: "https://developers.telnyx.com/docs/voice",
  iconEmoji: "☎️",

  capabilities: [
    { id: "voice.outbound_call", label: "Llamada saliente" },
    { id: "voice.ivr_flow", label: "Flujo IVR" },
  ],

  configSchema: [
    { key: "TELNYX_API_KEY", label: "API Key", type: "secret", required: true },
    {
      key: "TELNYX_VOICE_CONNECTION_ID",
      label: "Voice Connection ID",
      type: "text",
      required: true,
    },
    {
      key: "TELNYX_VOICE_MONTHLY_CAP",
      label: "Tope mensual de llamadas",
      type: "text",
      required: false,
      help: "Guardarraíl. Default 500.",
    },
  ],

  async test(): Promise<TestResult> {
    return hasCreds()
      ? { ok: true, message: "Credenciales presentes — llamadas reales activas." }
      : { ok: true, message: "Modo mock — simula llamadas y consume tope." };
  },

  async getStatus(): Promise<ConnectorStatus> {
    return (await getUsage(ID)) >= monthlyCap() ? "quota_exhausted" : "enabled";
  },

  async getQuota(): Promise<Quota> {
    return {
      used: await getUsage(ID),
      limit: monthlyCap(),
      unit: "api_calls",
      period: "month",
      resetAt: nextMonthlyReset(),
    };
  },

  async estimateQuotaImpact(count: number): Promise<{ willFit: boolean; remaining: number }> {
    const remaining = monthlyCap() - (await getUsage(ID));
    return { willFit: count <= remaining, remaining };
  },

  async send(
    _message: OutreachMessage,
    recipient: Contact,
  ): Promise<SendResult> {
    if (!recipient.telefono) return { ok: false, error: "Contacto sin teléfono" };

    if (!hasCreds()) {
      await incrementUsage(ID, 1);
      return { ok: true, providerMessageId: `mock-call-${recipient.dni}-${Date.now()}` };
    }

    try {
      const res = await fetch("https://api.telnyx.com/v2/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          connection_id: process.env.TELNYX_VOICE_CONNECTION_ID,
          to: recipient.telefono.replace(/[^0-9+]/g, ""),
          from: process.env.TELNYX_VOICE_FROM ?? "",
        }),
      });
      if (!res.ok) return { ok: false, error: `Telnyx HTTP ${res.status}` };
      const data = (await res.json()) as { data?: { call_control_id?: string } };
      await incrementUsage(ID, 1);
      return { ok: true, providerMessageId: data.data?.call_control_id };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
};
