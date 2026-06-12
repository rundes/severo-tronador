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
import { DEFAULT_PROJECT_ID } from "@/lib/projects";
import { getConnectorConfig } from "./config";
import { isValidEmail } from "@/lib/schemas";

// Tope mensual de envíos (guardarraíl). Default 3000 (free de Resend). Si tu
// plan de Resend es mayor (Pro = 50k/mes), subilo con RESEND_MONTHLY_LIMIT
// para que el send-queue no bloquee antes de tiempo.
const FREE_LIMIT = Number(process.env.RESEND_MONTHLY_LIMIT) || 3000;
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

  async getQuota(projectId: string = DEFAULT_PROJECT_ID): Promise<Quota> {
    return {
      used: await getUsage(ID, projectId),
      limit: FREE_LIMIT,
      unit: "messages",
      period: "month",
      resetAt: nextMonthlyReset(),
    };
  },

  async estimateQuotaImpact(
    count: number,
    projectId: string = DEFAULT_PROJECT_ID,
  ): Promise<{ willFit: boolean; remaining: number }> {
    const remaining = FREE_LIMIT - (await getUsage(ID, projectId));
    return { willFit: count <= remaining, remaining };
  },

  async send(
    message: OutreachMessage,
    recipient: Contact,
    projectId: string = DEFAULT_PROJECT_ID,
  ): Promise<SendResult> {
    if (!recipient.email) {
      return { ok: false, error: "Contacto sin email" };
    }
    if (!isValidEmail(recipient.email)) {
      return { ok: false, error: "Email inválido (formato)" };
    }

    const cfg = await getConnectorConfig(ID);

    if (!cfg.RESEND_API_KEY) {
      // Mock: simula un envío exitoso y consume cuota igual.
      await incrementUsage(ID, 1, projectId);
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
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        }),
      });
      if (!res.ok) {
        // Rate limit (429) y errores de servidor (5xx) son transitorios: el
        // cron debe reintentar con backoff. El resto (4xx de validación) es
        // un rechazo permanente del envío.
        const retryable = res.status === 429 || res.status >= 500;
        return { ok: false, error: `Resend HTTP ${res.status}`, retryable };
      }
      const data = (await res.json()) as { id?: string };
      await incrementUsage(ID, 1, projectId);
      return { ok: true, providerMessageId: data.id };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
};
