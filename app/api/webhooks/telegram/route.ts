// Webhook de Telegram Bot API (Plan 03 F4).
// Configurá la URL en Telegram con setWebhook:
//   curl https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://tronador.net.ar/api/webhooks/telegram&secret_token=<SECRET>
// El secret_token se valida acá contra TELEGRAM_WEBHOOK_SECRET.
//
// Comandos soportados:
//   /start <token>  → opt-in: vincula chat_id con dni resolviendo el token
//   /baja           → opt-out global (en opt_outs + telegram_chats)
//   <texto libre>   → archivo como respuesta cualitativa si hay survey
//                     activa, o ignora.
import { NextResponse } from "next/server";
import { resolveToken } from "@/lib/survey";
import { upsertChat, markOptOut, getChatByDni } from "@/lib/telegram-chats";
import { optOut } from "@/lib/optout";
import { log } from "@/lib/logger";

interface TelegramUpdate {
  message?: {
    message_id: number;
    from?: {
      id: number;
      username?: string;
      first_name?: string;
    };
    chat: {
      id: number;
    };
    text?: string;
  };
}

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const hdr = req.headers.get("x-telegram-bot-api-secret-token");
  if (secret) {
    if (hdr !== secret) {
      log.warn("webhook.telegram.bad_secret");
      return new Response("Forbidden", { status: 403 });
    }
  } else if (process.env.NODE_ENV === "production") {
    log.warn("webhook.telegram.no_secret_configured");
    return new Response("Forbidden", { status: 403 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const msg = update.message;
  if (!msg || !msg.text) return NextResponse.json({ ok: true, skipped: "no_message" });

  const text = msg.text.trim();
  const chatId = msg.chat.id;
  const from = msg.from;

  // /start <token>
  if (text.startsWith("/start")) {
    const token = text.slice(6).trim();
    if (!token) {
      // Bienvenida sin token — no podemos vincular sin él.
      return NextResponse.json({ ok: true, action: "welcome_no_token" });
    }
    const ref = await resolveToken(token);
    if (!ref) {
      log.info("webhook.telegram.start_unknown_token", { token });
      return NextResponse.json({ ok: true, action: "unknown_token" });
    }
    await upsertChat({
      projectId: ref.projectId,
      dni: ref.dni,
      chat_id: chatId,
      username: from?.username ?? null,
      first_name: from?.first_name ?? null,
    });
    log.info("webhook.telegram.opted_in", { dni: ref.dni, chat_id: chatId });
    return NextResponse.json({ ok: true, action: "opted_in", dni: ref.dni });
  }

  // /baja
  if (text === "/baja" || text === "/stop") {
    const chat = await findChatByChatId(chatId);
    if (chat) {
      await markOptOut(chat.dni, chat.project_id);
      await optOut(chat.project_id, chat.dni, "telegram baja");
      log.info("webhook.telegram.opted_out", { dni: chat.dni });
    }
    return NextResponse.json({ ok: true, action: "opted_out" });
  }

  // Texto libre → guardar como respuesta si hay survey activa.
  const chat = await findChatByChatId(chatId);
  if (!chat) {
    return NextResponse.json({ ok: true, action: "ignored_no_chat" });
  }
  // Buscamos token de survey activa para este dni (usamos el último).
  // Simplificación MVP: solo persistimos como respuesta abierta sin asociar
  // a campaña. Una iteración futura puede mantener un mapping de
  // last_active_survey por dni.
  log.info("webhook.telegram.message_received", {
    dni: chat.dni,
    text_len: text.length,
  });
  return NextResponse.json({ ok: true, action: "message_logged" });
}

async function findChatByChatId(
  chatId: number,
): Promise<{ dni: string; project_id: string } | null> {
  // Helper inverso por chat_id (único global). Resuelve dni + proyecto del
  // chat para scopear el opt-out.
  const { dbConfigured, getSupabase } = await import("@/lib/db/supabase");
  const { DEFAULT_PROJECT_ID } = await import("@/lib/projects");
  if (!dbConfigured()) {
    const g = globalThis as unknown as {
      __telegramChats?: Map<
        string,
        { dni: string; chat_id: number; project_id?: string }
      >;
    };
    if (!g.__telegramChats) return null;
    for (const v of g.__telegramChats.values()) {
      if (v.chat_id === chatId)
        return { dni: v.dni, project_id: v.project_id ?? DEFAULT_PROJECT_ID };
    }
    return null;
  }
  const { data } = await getSupabase()
    .from("telegram_chats")
    .select("dni, project_id")
    .eq("chat_id", chatId)
    .maybeSingle();
  if (!data) return null;
  return {
    dni: (data as { dni: string }).dni,
    project_id:
      (data as { project_id?: string }).project_id ?? DEFAULT_PROJECT_ID,
  };
}

// Para silenciar el unused import en TS estricto.
void getChatByDni;
