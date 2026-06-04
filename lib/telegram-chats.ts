// Store de Telegram chats vinculados (Plan 03 F4), POR PROYECTO.
// La API de Telegram solo permite enviar a chats que el bot ya conoce
// (el usuario hizo /start). Persistimos chat_id ↔ dni por proyecto.
//
// `projectId` es opcional (default = proyecto default): el webhook lo pasa
// resuelto del token; el connector de envío usa el default hasta Fase 4.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { DEFAULT_PROJECT_ID } from "@/lib/projects";

export interface TelegramChat {
  project_id?: string;
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
const memId = (projectId: string, dni: string) => `${projectId}:${dni}`;

export async function getChatByDni(
  dni: string,
  projectId: string = DEFAULT_PROJECT_ID,
): Promise<TelegramChat | null> {
  if (!dbConfigured()) return mem.get(memId(projectId, dni)) ?? null;
  const { data } = await getSupabase()
    .from("telegram_chats")
    .select("*")
    .eq("project_id", projectId)
    .eq("dni", dni)
    .maybeSingle();
  return (data ?? null) as TelegramChat | null;
}

export async function upsertChat(input: {
  dni: string;
  chat_id: number;
  projectId?: string;
  username?: string | null;
  first_name?: string | null;
}): Promise<void> {
  const projectId = input.projectId ?? DEFAULT_PROJECT_ID;
  const row: TelegramChat = {
    project_id: projectId,
    dni: input.dni,
    chat_id: input.chat_id,
    username: input.username ?? null,
    first_name: input.first_name ?? null,
    opted_in_at: new Date().toISOString(),
    opted_out_at: null,
  };
  if (!dbConfigured()) {
    mem.set(memId(projectId, input.dni), row);
    return;
  }
  await getSupabase()
    .from("telegram_chats")
    .upsert(row, { onConflict: "project_id,dni" });
}

export async function markOptOut(
  dni: string,
  projectId: string = DEFAULT_PROJECT_ID,
): Promise<void> {
  if (!dbConfigured()) {
    const cur = mem.get(memId(projectId, dni));
    if (cur)
      mem.set(memId(projectId, dni), {
        ...cur,
        opted_out_at: new Date().toISOString(),
      });
    return;
  }
  await getSupabase()
    .from("telegram_chats")
    .update({ opted_out_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("dni", dni);
}

export async function listOptedIn(
  projectId: string = DEFAULT_PROJECT_ID,
): Promise<TelegramChat[]> {
  if (!dbConfigured()) {
    return Array.from(mem.values()).filter(
      (c) => c.project_id === projectId && !c.opted_out_at,
    );
  }
  const { data } = await getSupabase()
    .from("telegram_chats")
    .select("*")
    .eq("project_id", projectId)
    .is("opted_out_at", null);
  return (data ?? []) as TelegramChat[];
}
