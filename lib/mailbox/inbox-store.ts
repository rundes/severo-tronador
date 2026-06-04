// Bandeja de entrada persistida (modo Cloudflare+Resend, sin Stalwart).
// El webhook mail-in guarda cada entrante; /mail lo lee. Por proyecto.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { log } from "@/lib/logger";
import type { EmailFull, EmailListItem } from "./types";

interface InboundRow {
  id: string;
  project_id: string;
  message_id: string | null;
  from_email: string;
  from_name: string | null;
  to_email: string | null;
  subject: string | null;
  preview: string | null;
  body_text: string | null;
  body_html: string | null;
  received_at: string;
  read_at: string | null;
}

interface Mem {
  __inboundEmails?: InboundRow[];
}
const g = globalThis as unknown as Mem;
const mem = (g.__inboundEmails ??= []);

function toListItem(r: InboundRow): EmailListItem {
  return {
    id: r.id,
    threadId: r.id,
    mailboxIds: ["inbox"],
    from: { name: r.from_name ?? undefined, email: r.from_email },
    to: r.to_email ? [{ email: r.to_email }] : [],
    subject: r.subject ?? "(sin asunto)",
    preview: r.preview ?? "",
    receivedAt: r.received_at,
    isUnread: !r.read_at,
    hasAttachment: false,
  };
}

export interface StoreInboundInput {
  projectId: string;
  messageId?: string | null;
  fromEmail: string;
  fromName?: string | null;
  toEmail?: string | null;
  subject?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  receivedAt?: string;
}

export async function storeInbound(input: StoreInboundInput): Promise<void> {
  const preview = (input.bodyText ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
  const row = {
    project_id: input.projectId,
    message_id: input.messageId ?? null,
    from_email: input.fromEmail,
    from_name: input.fromName ?? null,
    to_email: input.toEmail ?? null,
    subject: input.subject ?? null,
    preview,
    body_text: input.bodyText ?? null,
    body_html: input.bodyHtml ?? null,
    received_at: input.receivedAt ?? new Date().toISOString(),
    read_at: null,
  };
  if (!dbConfigured()) {
    mem.unshift({ id: crypto.randomUUID(), ...row });
    return;
  }
  // Dedupe por message_id (índice único parcial). Ignoramos conflicto.
  const { error } = await getSupabase()
    .from("inbound_emails")
    .upsert(row, { onConflict: "message_id", ignoreDuplicates: true });
  if (error) log.warn("inbox.store_failed", { error: error.message });
}

export async function listInbound(projectId: string): Promise<EmailListItem[]> {
  if (!dbConfigured()) {
    return mem
      .filter((r) => r.project_id === projectId)
      .sort((a, b) => b.received_at.localeCompare(a.received_at))
      .map(toListItem);
  }
  const { data, error } = await getSupabase()
    .from("inbound_emails")
    .select("*")
    .eq("project_id", projectId)
    .order("received_at", { ascending: false })
    .limit(100);
  if (error) {
    log.warn("inbox.list_failed", { error: error.message });
    return [];
  }
  return (data ?? []).map((r) => toListItem(r as InboundRow));
}

export async function getInbound(
  projectId: string,
  id: string,
): Promise<EmailFull | null> {
  let row: InboundRow | undefined;
  if (!dbConfigured()) {
    row = mem.find((r) => r.id === id && r.project_id === projectId);
  } else {
    const { data } = await getSupabase()
      .from("inbound_emails")
      .select("*")
      .eq("id", id)
      .eq("project_id", projectId)
      .maybeSingle();
    row = (data ?? undefined) as InboundRow | undefined;
  }
  if (!row) return null;
  return {
    ...toListItem(row),
    bodyText: row.body_text ?? "",
    bodyHtml: row.body_html ?? undefined,
  };
}

export async function markInboundRead(
  projectId: string,
  id: string,
): Promise<void> {
  if (!dbConfigured()) {
    const r = mem.find((x) => x.id === id && x.project_id === projectId);
    if (r) r.read_at = new Date().toISOString();
    return;
  }
  await getSupabase()
    .from("inbound_emails")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("project_id", projectId);
}

export async function inboxUnreadCount(projectId: string): Promise<number> {
  if (!dbConfigured()) {
    return mem.filter((r) => r.project_id === projectId && !r.read_at).length;
  }
  const { count } = await getSupabase()
    .from("inbound_emails")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId)
    .is("read_at", null);
  return count ?? 0;
}
