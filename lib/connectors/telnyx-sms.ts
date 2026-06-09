// Conector de SMS: Telnyx. Categoría `outreach`.
// SMS a AR es pago (~$0.04/SMS, sin free tier). No hay cuota gratuita: el
// "límite" es un tope de gasto mensual configurable (guardarraíl), porque el
// sistema es administrador de un recurso escaso. Sin TELNYX_API_KEY → mock.
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
import { DEFAULT_PROJECT_ID } from "@/lib/projects";
import { getConnectorConfig } from "./config";
import { isValidPhone } from "@/lib/schemas";

const ID = "telnyx-sms";

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

  async test(config?: Config): Promise<TestResult> {
    const cfg = config ?? await getConnectorConfig(ID);
    return (cfg.TELNYX_API_KEY && cfg.TELNYX_MESSAGING_PROFILE_ID)
      ? { ok: true, message: "Credenciales presentes — envío real activo." }
      : { ok: true, message: "Modo mock — simula SMS y consume tope." };
  },

  async getStatus(): Promise<ConnectorStatus> {
    const cfg = await getConnectorConfig(ID);
    const cap = Number(cfg.TELNYX_SMS_MONTHLY_CAP) || 2000;
    return (await getUsage(ID)) >= cap ? "quota_exhausted" : "enabled";
  },

  async getQuota(projectId: string = DEFAULT_PROJECT_ID): Promise<Quota> {
    const cfg = await getConnectorConfig(ID);
    const cap = Number(cfg.TELNYX_SMS_MONTHLY_CAP) || 2000;
    return {
      used: await getUsage(ID, projectId),
      limit: cap,
      unit: "messages",
      period: "month",
      resetAt: nextMonthlyReset(),
    };
  },

  async estimateQuotaImpact(
    count: number,
    projectId: string = DEFAULT_PROJECT_ID,
  ): Promise<{ willFit: boolean; remaining: number }> {
    const cfg = await getConnectorConfig(ID);
    const cap = Number(cfg.TELNYX_SMS_MONTHLY_CAP) || 2000;
    const remaining = cap - (await getUsage(ID, projectId));
    return { willFit: count <= remaining, remaining };
  },

  async send(
    message: OutreachMessage,
    recipient: Contact,
    projectId: string = DEFAULT_PROJECT_ID,
  ): Promise<SendResult> {
    if (!recipient.telefono) return { ok: false, error: "Contacto sin teléfono" };
    if (!isValidPhone(recipient.telefono)) {
      return { ok: false, error: "Teléfono inválido (E.164)" };
    }

    const cfg = await getConnectorConfig(ID);

    if (!(cfg.TELNYX_API_KEY && cfg.TELNYX_MESSAGING_PROFILE_ID)) {
      await incrementUsage(ID, 1, projectId);
      return { ok: true, providerMessageId: `mock-sms-${recipient.dni}-${Date.now()}` };
    }

    try {
      const res = await fetch("https://api.telnyx.com/v2/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.TELNYX_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_profile_id: cfg.TELNYX_MESSAGING_PROFILE_ID,
          to: recipient.telefono.replace(/[^0-9+]/g, ""),
          text: message.body,
        }),
      });
      if (!res.ok) {
        // Telnyx devuelve { errors: [{ code, title, detail }] }. Surfacear el
        // detalle ayuda a diagnosticar (ej. 409 = número/perfil sin asignar).
        const detail = await res
          .json()
          .then((b: { errors?: { code?: string; detail?: string }[] }) =>
            b.errors?.map((e) => `${e.code ?? "?"}: ${e.detail ?? e.code}`).join("; "),
          )
          .catch(() => undefined);
        return {
          ok: false,
          error: `Telnyx HTTP ${res.status}${detail ? ` — ${detail}` : ""}`,
        };
      }
      const data = (await res.json()) as { data?: { id?: string } };
      await incrementUsage(ID, 1, projectId);
      return { ok: true, providerMessageId: data.data?.id };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
};
