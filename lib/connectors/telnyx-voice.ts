// Conector de voz/IVR: Telnyx. Categoría `outreach`.
// Llamada saliente automática (encuesta IVR): el cuerpo del mensaje es el
// guion TTS. Pago (~$0.004/min). Tope mensual de llamadas como guardarraíl.
// Sin TELNYX_API_KEY → mock. (Para encuestas conversacionales con IA ver el
// conector bland-ai, F5+.)
import type {
  Config,
  ConnectorStatus,
  Contact,
  OutreachConnector,
  OutreachMessage,
  Quota,
  SendResult,
  TestResult,
} from "./types";
import { getUsage, incrementUsage, nextMonthlyReset } from "@/lib/quota";
import { getConnectorConfig } from "./config";

const ID = "telnyx-voice";

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

  async test(config?: Config): Promise<TestResult> {
    const cfg = config ?? await getConnectorConfig(ID);
    return (cfg.TELNYX_API_KEY && cfg.TELNYX_VOICE_CONNECTION_ID)
      ? { ok: true, message: "Credenciales presentes — llamadas reales activas." }
      : { ok: true, message: "Modo mock — simula llamadas y consume tope." };
  },

  async getStatus(): Promise<ConnectorStatus> {
    const cfg = await getConnectorConfig(ID);
    const cap = Number(cfg.TELNYX_VOICE_MONTHLY_CAP) || 500;
    return (await getUsage(ID)) >= cap ? "quota_exhausted" : "enabled";
  },

  async getQuota(): Promise<Quota> {
    const cfg = await getConnectorConfig(ID);
    const cap = Number(cfg.TELNYX_VOICE_MONTHLY_CAP) || 500;
    return {
      used: await getUsage(ID),
      limit: cap,
      unit: "api_calls",
      period: "month",
      resetAt: nextMonthlyReset(),
    };
  },

  async estimateQuotaImpact(count: number): Promise<{ willFit: boolean; remaining: number }> {
    const cfg = await getConnectorConfig(ID);
    const cap = Number(cfg.TELNYX_VOICE_MONTHLY_CAP) || 500;
    const remaining = cap - (await getUsage(ID));
    return { willFit: count <= remaining, remaining };
  },

  async send(
    _message: OutreachMessage,
    recipient: Contact,
  ): Promise<SendResult> {
    if (!recipient.telefono) return { ok: false, error: "Contacto sin teléfono" };

    const cfg = await getConnectorConfig(ID);

    if (!(cfg.TELNYX_API_KEY && cfg.TELNYX_VOICE_CONNECTION_ID)) {
      await incrementUsage(ID, 1);
      return { ok: true, providerMessageId: `mock-call-${recipient.dni}-${Date.now()}` };
    }

    try {
      const res = await fetch("https://api.telnyx.com/v2/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.TELNYX_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          connection_id: cfg.TELNYX_VOICE_CONNECTION_ID,
          to: recipient.telefono.replace(/[^0-9+]/g, ""),
          from: cfg.TELNYX_VOICE_FROM ?? "",
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
