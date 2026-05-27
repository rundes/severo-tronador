// Conector de SMS: Telnyx. Categoría `outreach`.
// SMS a AR es pago (~$0.04/SMS, sin free tier). No hay cuota gratuita: el
// "límite" es un tope de gasto mensual configurable (guardarraíl), porque el
// sistema es administrador de un recurso escaso. Sin TELNYX_API_KEY → mock.
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

const ID = "telnyx-sms";

// Tope mensual de SMS como guardarraíl de gasto (configurable por env).
function monthlyCap(): number {
  const v = Number(process.env.TELNYX_SMS_MONTHLY_CAP);
  return Number.isFinite(v) && v > 0 ? v : 2000;
}

function hasCreds(): boolean {
  return Boolean(
    process.env.TELNYX_API_KEY && process.env.TELNYX_MESSAGING_PROFILE_ID,
  );
}

export const telnyxSmsConnector: OutreachConnector = {
  id: ID,
  name: "Telnyx SMS",
  vendor: "Telnyx LLC",
  category: "outreach",
  description: "SMS pago (~$0.04 AR). Tope mensual como guardarraíl.",
  docsUrl: "https://developers.telnyx.com/docs/messaging",
  iconEmoji: "📱",

  capabilities: [{ id: "sms.send", label: "Enviar SMS", costPerUnit: 0.04 }],

  configSchema: [
    { key: "TELNYX_API_KEY", label: "API Key", type: "secret", required: true },
    {
      key: "TELNYX_MESSAGING_PROFILE_ID",
      label: "Messaging Profile ID",
      type: "text",
      required: true,
    },
    {
      key: "TELNYX_SMS_MONTHLY_CAP",
      label: "Tope mensual de SMS",
      type: "text",
      required: false,
      help: "Guardarraíl de gasto. Default 2000.",
    },
  ],

  async test(): Promise<TestResult> {
    return hasCreds()
      ? { ok: true, message: "Credenciales presentes — envío real activo." }
      : { ok: true, message: "Modo mock — simula SMS y consume tope." };
  },

  async getStatus(): Promise<ConnectorStatus> {
    return getUsage(ID) >= monthlyCap() ? "quota_exhausted" : "enabled";
  },

  async getQuota(): Promise<Quota> {
    return {
      used: getUsage(ID),
      limit: monthlyCap(),
      unit: "messages",
      period: "month",
      resetAt: nextMonthlyReset(),
    };
  },

  estimateQuotaImpact(count: number): { willFit: boolean; remaining: number } {
    const remaining = monthlyCap() - getUsage(ID);
    return { willFit: count <= remaining, remaining };
  },

  async send(
    message: OutreachMessage,
    recipient: Contact,
  ): Promise<SendResult> {
    if (!recipient.telefono) return { ok: false, error: "Contacto sin teléfono" };

    if (!hasCreds()) {
      incrementUsage(ID, 1);
      return { ok: true, providerMessageId: `mock-sms-${recipient.dni}-${Date.now()}` };
    }

    try {
      const res = await fetch("https://api.telnyx.com/v2/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID,
          to: recipient.telefono.replace(/[^0-9+]/g, ""),
          text: message.body,
        }),
      });
      if (!res.ok) return { ok: false, error: `Telnyx HTTP ${res.status}` };
      const data = (await res.json()) as { data?: { id?: string } };
      incrementUsage(ID, 1);
      return { ok: true, providerMessageId: data.data?.id };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
};
