// Store de Telegram chats vinculados (Plan 03 F4).
// La API de Telegram solo permite enviar mensajes a chats que el bot ya
// conoce (el usuario tuvo que iniciar la conversación con /start). Por
// eso necesitamos persistir el chat_id ↔ dni mapping.

import { dbConfigured, getSupabase } from "@/lib/db/supabase";

export interface TelegramChat {
  dni: string;
  chat_id: number;
  username: string | null;
  first_name: string | null;
  opted_in_at: string;
  opted_out_at: string | null;
}

interface MemStore {
  __telegramChats?: Map<string, TelegramChat>;
}
const g = globalThis as unknown as MemStore;
const mem = (g.__telegramChats ??= new Map());

export async function getChatByDni(
  dni: string,
): Promise<TelegramChat | null> {
  if (!dbConfigured()) return mem.get(dni) ?? null;
  const { data } = await getSupabase()
    .from("telegram_chats")
    .select("*")
    .eq("dni", dni)
    .maybeSingle();
  return (data ?? null) as TelegramChat | null;
}

export async function upsertChat(input: {
  dni: string;
  chat_id: number;
  username?: string | null;
  first_name?: string | null;
}): Promise<void> {
  const row: TelegramChat = {
    dni: input.dni,
    chat_id: input.chat_id,
    username: input.username ?? null,
    first_name: input.first_name ?? null,
    opted_in_at: new Date().toISOString(),
    opted_out_at: null,
  };
  if (!dbConfigured()) {
    mem.set(input.dni, row);
    return;
  }
  await getSupabase()
    .from("telegram_chats")
    .upsert(row, { onConflict: "dni" });
}

export async function markOptOut(dni: string): Promise<void> {
  if (!dbConfigured()) {
    const cur = mem.get(dni);
    if (cur) mem.set(dni, { ...cur, opted_out_at: new Date().toISOString() });
    return;
  }
  await getSupabase()
    .from("telegram_chats")
    .update({ opted_out_at: new Date().toISOString() })
    .eq("dni", dni);
}

export async function listOptedIn(): Promise<TelegramChat[]> {
  if (!dbConfigured()) {
    return Array.from(mem.values()).filter((c) => !c.opted_out_at);
  }
  const { data } = await getSupabase()
    .from("telegram_chats")
    .select("*")
    .is("opted_out_at", null);
  return (data ?? []) as TelegramChat[];
}
