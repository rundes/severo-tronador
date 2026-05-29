// Conector de WhatsApp: Meta Cloud API (directo, sin intermediario).
// 1.000 conversaciones service-initiated gratis/mes. Sin credenciales corre en
// modo mock. Con ellas envía vía Graph API.
//
// Nota: WhatsApp business-initiated FUERA de la ventana de 24h exige una
// plantilla PRE-APROBADA por Meta (vertical Survey/Research). Mientras no
// tengamos templates aprobados, el envío real usa type=text (válido solo
// dentro de la ventana de 24h); el mock simula sin restricción.
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
import { isValidPhone } from "@/lib/schemas";

const FREE_LIMIT = 1000; // conversaciones service-initiated/mes
const ID = "meta-wa-cloud";

export const metaWaCloudConnector: OutreachConnector = {
  id: ID,
  name: "Meta Cloud API (WhatsApp)",
  vendor: "Meta Platforms, Inc.",
  category: "outreach",
  description: "WhatsApp directo — 1.000 conversaciones service gratis/mes.",
  docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api",
  iconEmoji: "💬",

  capabilities: [
    // 1k conversations/mes free. Después ~$0.01-0.05 según país/categoría;
    // usamos $0.02 como estimación AR business-initiated.
    { id: "wa.send_template", label: "Enviar plantilla aprobada", costPerUnit: 0.02 },
    { id: "wa.send_freeform_in_24h_window", label: "Texto libre (ventana 24h)" },
  ],

  configSchema: [
    {
      key: "META_WA_PHONE_NUMBER_ID",
      label: "Phone Number ID",
      type: "text",
      required: true,
    },
    {
      key: "META_WA_ACCESS_TOKEN",
      label: "Access Token",
      type: "secret",
      required: true,
    },
    {
      key: "META_WA_VERIFY_TOKEN",
      label: "Verify Token (webhook)",
      type: "secret",
      required: false,
      help: "Token compartido para verificar el webhook de estados.",
    },
  ],

  async test(config?: Config): Promise<TestResult> {
    const cfg = config ?? await getConnectorConfig(ID);
    return (cfg.META_WA_PHONE_NUMBER_ID && cfg.META_WA_ACCESS_TOKEN)
      ? { ok: true, message: "Credenciales presentes — envío real activo." }
      : { ok: true, message: "Modo mock — simula envíos y consume cuota." };
  },

  async getStatus(): Promise<ConnectorStatus> {
    return (await getUsage(ID)) >= FREE_LIMIT ? "quota_exhausted" : "enabled";
  },

  async getQuota(): Promise<Quota> {
    return {
      used: await getUsage(ID),
      limit: FREE_LIMIT,
      unit: "conversations",
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
    if (!recipient.telefono) {
      return { ok: false, error: "Contacto sin teléfono" };
    }
    if (!isValidPhone(recipient.telefono)) {
      return { ok: false, error: "Teléfono inválido (E.164)" };
    }

    const cfg = await getConnectorConfig(ID);

    if (!(cfg.META_WA_PHONE_NUMBER_ID && cfg.META_WA_ACCESS_TOKEN)) {
      await incrementUsage(ID, 1);
      return { ok: true, providerMessageId: `mock-wa-${recipient.dni}-${Date.now()}` };
    }

    try {
      const to = recipient.telefono.replace(/[^0-9]/g, "");
      // Si la campaña trae template Meta-aprobado usa type=template (válido
      // fuera de la ventana 24h). Si no, type=text (solo dentro de 24h).
      const body = message.template
        ? {
            messaging_product: "whatsapp",
            to,
            type: "template",
            template: {
              name: message.template.name,
              language: { code: message.template.lang },
              components: message.template.params?.length
                ? [
                    {
                      type: "body",
                      parameters: message.template.params.map((p) => ({
                        type: "text",
                        text: p,
                      })),
                    },
                  ]
                : undefined,
            },
          }
        : {
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { body: message.body },
          };
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${cfg.META_WA_PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cfg.META_WA_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        return { ok: false, error: `Meta HTTP ${res.status}` };
      }
      const data = (await res.json()) as {
        messages?: { id?: string }[];
      };
      await incrementUsage(ID, 1);
      return { ok: true, providerMessageId: data.messages?.[0]?.id };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
};
