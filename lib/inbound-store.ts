// Persistencia de mensajes entrantes (inbound_messages). Memory + DB.
// Idempotencia por (channel, provider_message_id): un reintento del proveedor
// no duplica la fila ni la respuesta derivada.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { memoryRepo } from "@/lib/db/memory";

export interface InboundRow {
  id?: string;
  project_id: string | null;
  channel: string;
  sender_external_id: string;
  dni: string | null;
  body: string;
  provider_message_id: string | null;
  campaign_id: string | null;
  respuesta_token: string | null;
  is_opt_out: boolean;
  raw: unknown | null;
  received_at?: string;
}

const mem = () => memoryRepo<InboundRow & { id?: string }>("inbound_messages");

export async function inboundExists(
  channel: string,
  providerMessageId: string,
): Promise<boolean> {
  if (!dbConfigured()) {
    const all = await mem().list();
    return all.some(
      (r) => r.channel === channel && r.provider_message_id === providerMessageId,
    );
  }
  const { data } = await getSupabase()
    .from("inbound_messages")
    .select("id")
    .eq("channel", channel)
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();
  return Boolean(data);
}

export async function recordInbound(
  row: InboundRow,
): Promise<{ inserted: boolean }> {
  // Idempotencia: si ya existe por (channel, provider_message_id) → no-op.
  if (row.provider_message_id) {
    if (await inboundExists(row.channel, row.provider_message_id)) {
      return { inserted: false };
    }
  }
  if (!dbConfigured()) {
    await mem().upsert({ ...row, id: undefined, received_at: new Date().toISOString() });
    return { inserted: true };
  }
  const { error } = await getSupabase()
    .from("inbound_messages")
    .insert({ ...row, processed_at: new Date().toISOString() });
  if (error) {
    // 23505 = unique_violation (carrera entre reintentos): tratamos como no-op.
    if ((error as { code?: string }).code === "23505") return { inserted: false };
    throw error;
  }
  return { inserted: true };
}

export interface InboundListFilter {
  projectId: string;
  channel?: string;
  onlyOrphans?: boolean; // sin match de dni contra el padrón
  limit?: number;
}

// Lectura para la bandeja de entrantes: recientes primero.
export async function listInbound({
  projectId,
  channel,
  onlyOrphans,
  limit = 200,
}: InboundListFilter): Promise<InboundRow[]> {
  if (!dbConfigured()) {
    return (await mem().list())
      .filter(
        (r) =>
          r.project_id === projectId &&
          (!channel || r.channel === channel) &&
          (!onlyOrphans || r.dni === null),
      )
      .sort((a, b) => +new Date(b.received_at ?? 0) - +new Date(a.received_at ?? 0))
      .slice(0, limit);
  }
  let q = getSupabase()
    .from("inbound_messages")
    .select(
      "id, project_id, channel, sender_external_id, dni, body, provider_message_id, campaign_id, respuesta_token, is_opt_out, received_at",
    )
    .eq("project_id", projectId);
  if (channel) q = q.eq("channel", channel);
  if (onlyOrphans) q = q.is("dni", null);
  const { data, error } = await q
    .order("received_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as InboundRow[];
}
