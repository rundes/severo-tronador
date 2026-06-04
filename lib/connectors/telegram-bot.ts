// Conector outreach: Telegram Bot API (Plan 03 F4).
// Gratis e ilimitado. Constraint clave: el bot solo puede mensajear chats
// que el usuario inició con /start. Por eso necesitamos opt-in previo
// (ver telegram_chats + webhook).
//
// Si no hay TELEGRAM_BOT_TOKEN → mock. Con token, envía via Bot API.

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
import { getChatByDni } from "@/lib/telegram-chats";

const ID = "telegram-bot";
const SOFT_LIMIT = 100000; // Telegram bot API es 30 msgs/seg + 20 grupos/min. Tope blando para tracking.

async function bot(token: string, method: string, body: unknown): Promise<Response> {
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const telegramBotConnector: OutreachConnector = {
  id: ID,
  name: "Telegram Bot",
  vendor: "Telegram FZ-LLC",
  category: "outreach",
  description:
    "Canal complementario gratuito. Requiere opt-in del usuario (link t.me/<bot>?start=token).",
  docsUrl: "https://core.telegram.org/bots/api",
  iconEmoji: "✈️",

  capabilities: [
    { id: "telegram.send_message", label: "Enviar mensaje (gratis)", costPerUnit: 0 },
    { id: "telegram.receive_replies", label: "Recibir respuestas via webhook" },
  ],

  configSchema: [
    {
      key: "TELEGRAM_BOT_TOKEN",
      label: "Bot Token",
      type: "secret",
      required: true,
      placeholder: "123456:ABC-DEF…",
      help: "Token del bot generado por @BotFather en Telegram.",
    },
    {
      key: "TELEGRAM_BOT_USERNAME",
      label: "Username del bot",
      type: "text",
      required: false,
      placeholder: "tronador_bot",
      help: "Sin @. Se usa para armar el link t.me/<username>?start=<token>.",
    },
  ],

  async test(config?: Config): Promise<TestResult> {
    const cfg = config ?? (await getConnectorConfig(ID));
    if (!cfg.TELEGRAM_BOT_TOKEN) {
      return {
        ok: true,
        message: "Modo mock — sin TELEGRAM_BOT_TOKEN configurado.",
      };
    }
    try {
      const res = await bot(cfg.TELEGRAM_BOT_TOKEN, "getMe", {});
      const data = (await res.json()) as {
        ok: boolean;
        result?: { username?: string; first_name?: string };
        description?: string;
      };
      if (!data.ok) {
        return {
          ok: false,
          message: `Telegram API error: ${data.description ?? "unknown"}`,
        };
      }
      return {
        ok: true,
        message: `Conectado como @${data.result?.username ?? "bot"}.`,
        details: {
          username: data.result?.username ?? null,
          name: data.result?.first_name ?? null,
        },
      };
    } catch (err) {
      return {
        ok: false,
        message: `Error conectando a Telegram: ${(err as Error).message}`,
      };
    }
  },

  async getStatus(): Promise<ConnectorStatus> {
    return "enabled";
  },

  async getQuota(projectId: string = DEFAULT_PROJECT_ID): Promise<Quota> {
    return {
      used: await getUsage(ID, projectId),
      limit: SOFT_LIMIT,
      unit: "messages",
      period: "month",
      resetAt: nextMonthlyReset(),
    };
  },

  async estimateQuotaImpact(
    count: number,
    projectId: string = DEFAULT_PROJECT_ID,
  ) {
    const remaining = SOFT_LIMIT - (await getUsage(ID, projectId));
    return { willFit: count <= remaining, remaining };
  },

  async send(
    message: OutreachMessage,
    recipient: Contact,
    projectId: string = DEFAULT_PROJECT_ID,
  ): Promise<SendResult> {
    // Necesita opt-in del usuario. Sin chat_id no podemos mandar.
    const chat = await getChatByDni(recipient.dni);
    if (!chat || chat.opted_out_at) {
      return {
        ok: false,
        error: chat ? "opted_out" : "telegram_no_optin",
      };
    }

    const cfg = await getConnectorConfig(ID);
    if (!cfg.TELEGRAM_BOT_TOKEN) {
      await incrementUsage(ID, 1, projectId);
      return {
        ok: true,
        providerMessageId: `mock-tg-${recipient.dni}-${Date.now()}`,
      };
    }

    try {
      const res = await bot(cfg.TELEGRAM_BOT_TOKEN, "sendMessage", {
        chat_id: chat.chat_id,
        text: message.body,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
      const data = (await res.json()) as {
        ok: boolean;
        result?: { message_id?: number };
        description?: string;
      };
      if (!data.ok) {
        return { ok: false, error: data.description ?? `Telegram HTTP ${res.status}` };
      }
      await incrementUsage(ID, 1, projectId);
      return {
        ok: true,
        providerMessageId: data.result?.message_id?.toString(),
      };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
};
