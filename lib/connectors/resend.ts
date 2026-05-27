// Conector de email: Resend. Categoría `outreach`.
// 3.000 emails/mes gratis. Sin RESEND_API_KEY corre en modo mock (simula el
// envío y consume cuota igual, para poder probar el flujo de campaña end-to-end
// sin credenciales). Con la key, envía de verdad.
import type {
  Config,
  Contact,
  ConnectorStatus,
  OutreachConnector,
  OutreachMessage,
  Quota,
  SendResult,
  TestResult,
} from "./types";
import { getUsage, incrementUsage, nextMonthlyReset } from "@/lib/quota";
import { getConnectorConfig } from "./config";

const FREE_LIMIT = 3000;
const ID = "resend";

export const resendConnector: OutreachConnector = {
  id: ID,
  name: "Resend (Email)",
  vendor: "Resend, Inc.",
  category: "outreach",
  description: "Email transaccional — 3.000/mes gratis.",
  docsUrl: "https://resend.com/docs",
  iconEmoji: "📧",

  capabilities: [
    { id: "email.send", label: "Enviar email", costPerUnit: 0 },
    { id: "email.track_open", label: "Tracking de apertura" },
  ],

  configSchema: [
    {
      key: "RESEND_API_KEY",
      label: "API Key",
      type: "secret",
      required: true,
      placeholder: "re_…",
    },
    {
      key: "RESEND_FROM",
      label: "Remitente (From)",
      type: "email",
      required: true,
      placeholder: "relevamiento@encuestas.tu-dominio.ar",
    },
  ],

  async test(config?: Config): Promise<TestResult> {
    const cfg = config ?? await getConnectorConfig(ID);
    return cfg.RESEND_API_KEY
      ? { ok: true, message: "API key presente — envío real activo." }
      : {
          ok: true,
          message: "Modo mock — simula envíos y consume cuota (sin API key).",
        };
  },

  async getStatus(): Promise<ConnectorStatus> {
    return (await getUsage(ID)) >= FREE_LIMIT ? "quota_exhausted" : "enabled";
  },

  async getQuota(): Promise<Quota> {
    return {
      used: await getUsage(ID),
      limit: FREE_LIMIT,
      unit: "messages",
      period: "month",
      resetAt: nextMonthlyReset(),
    };
  },

  async estimateQuotaImpact(count: number): Promise<{ willFit: boolean; remaining: number }> {
    const remaining = FREE_LIMIT - (await getUsage(ID));
    return { willFit: count <= remaining, remaining };
  },

  async send(
    message: OutreachMessage,
    recipient: Contact,
  ): Promise<SendResult> {
    if (!recipient.email) {
      return { ok: false, error: "Contacto sin email" };
    }

    const cfg = await getConnectorConfig(ID);

    if (!cfg.RESEND_API_KEY) {
      // Mock: simula un envío exitoso y consume cuota igual.
      await incrementUsage(ID, 1);
      return { ok: true, providerMessageId: `mock-${recipient.dni}-${Date.now()}` };
    }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: cfg.RESEND_FROM,
          to: recipient.email,
          subject: message.subject ?? "",
          html: message.body,
        }),
      });
      if (!res.ok) {
        return { ok: false, error: `Resend HTTP ${res.status}` };
      }
      const data = (await res.json()) as { id?: string };
      await incrementUsage(ID, 1);
      return { ok: true, providerMessageId: data.id };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
};
