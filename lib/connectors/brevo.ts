// Conector de email: Brevo (ex-Sendinblue). Categoría `outreach`. Segundo
// proveedor de email, alternativo a Resend. Plan free: 300 emails/día. Sin
// BREVO_API_KEY corre en modo mock (simula el envío y consume cuota igual,
// para probar el flujo end-to-end). Con la key, envía de verdad vía la API
// transaccional (POST /v3/smtp/email).
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

// Guardarraíl mensual. El free de Brevo son 300/día (~9.000/mes); subilo con
// BREVO_MONTHLY_LIMIT si tu plan es mayor.
const FREE_LIMIT = Number(process.env.BREVO_MONTHLY_LIMIT) || 9000;
const ID = "brevo";

export const brevoConnector: OutreachConnector = {
  id: ID,
  name: "Brevo (Email)",
  vendor: "Brevo (Sendinblue)",
  category: "outreach",
  description: "Email transaccional — 300/día gratis. Alternativa a Resend.",
  docsUrl: "https://developers.brevo.com/reference/sendtransacemail",
  iconEmoji: "📨",

  capabilities: [{ id: "email.send", label: "Enviar email", costPerUnit: 0 }],

  configSchema: [
    {
      key: "BREVO_API_KEY",
      label: "API Key",
      type: "secret",
      required: true,
      placeholder: "xkeysib-…",
    },
    {
      key: "BREVO_FROM_EMAIL",
      label: "Remitente (From)",
      type: "email",
      required: true,
      placeholder: "relevamiento@encuestas.tu-dominio.ar",
    },
    {
      key: "BREVO_FROM_NAME",
      label: "Nombre del remitente",
      type: "text",
      required: false,
      placeholder: "Relevamiento Tronador",
    },
  ],

  async test(config?: Config): Promise<TestResult> {
    const cfg = config ?? (await getConnectorConfig(ID));
    return cfg.BREVO_API_KEY
      ? { ok: true, message: "API key presente — envío real activo." }
      : { ok: true, message: "Modo mock — simula envíos y consume cuota (sin API key)." };
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
    if (!recipient.email) return { ok: false, error: "Contacto sin email" };
    if (!isValidEmail(recipient.email)) {
      return { ok: false, error: "Email inválido (formato)" };
    }

    const cfg = await getConnectorConfig(ID);

    if (!cfg.BREVO_API_KEY) {
      // Mock: simula un envío exitoso y consume cuota igual.
      await incrementUsage(ID, 1, projectId);
      return { ok: true, providerMessageId: `mock-${recipient.dni}-${Date.now()}` };
    }

    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": cfg.BREVO_API_KEY,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          sender: {
            email: cfg.BREVO_FROM_EMAIL,
            ...(cfg.BREVO_FROM_NAME ? { name: cfg.BREVO_FROM_NAME } : {}),
          },
          to: [{ email: recipient.email }],
          subject: message.subject ?? "",
          htmlContent: message.body,
          ...(message.replyTo ? { replyTo: { email: message.replyTo } } : {}),
        }),
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as { message?: string };
          if (body.message) detail = body.message;
        } catch {
          // sin cuerpo JSON
        }
        return { ok: false, error: `Brevo ${detail}` };
      }
      const data = (await res.json()) as { messageId?: string };
      await incrementUsage(ID, 1, projectId);
      return { ok: true, providerMessageId: data.messageId };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
};
