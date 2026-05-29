// Persistencia de credenciales JMAP por usuario (Plan 04 F2).
// Encriptación AES-GCM con CONFIG_MASTER_KEY a nivel campo. Resto del
// row queda en claro (mailbox_address, timestamps) — el secreto es solo
// la password.
//
// Memory fallback cuando Supabase no está configurado, para que la UI
// pueda ejercitar el flujo en local sin credenciales.
import { decryptJson, encryptJson } from "@/lib/crypto";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";

export interface MailboxCredential {
  userEmail: string;
  address: string;
  password: string;
  provisionedAt: string;
  lastLoginAt?: string;
}

interface MemoryRow {
  user_email: string;
  mailbox_address: string;
  jmap_password_encrypted: string;
  provisioned_at: string;
  last_login_at?: string;
}

const memory = new Map<string, MemoryRow>();

export async function getCredentialFor(
  userEmail: string,
): Promise<MailboxCredential | null> {
  const row = await readRow(userEmail);
  if (!row) return null;
  const { value } = await decryptJson<{ value: string }>(
    row.jmap_password_encrypted,
  );
  return {
    userEmail: row.user_email,
    address: row.mailbox_address,
    password: value,
    provisionedAt: row.provisioned_at,
    lastLoginAt: row.last_login_at,
  };
}

export async function saveCredential(input: {
  userEmail: string;
  address: string;
  password: string;
}): Promise<void> {
  const enc = await encryptJson({ value: input.password });
  const row: MemoryRow = {
    user_email: input.userEmail,
    mailbox_address: input.address,
    jmap_password_encrypted: enc,
    provisioned_at: new Date().toISOString(),
  };
  if (!dbConfigured()) {
    memory.set(input.userEmail, row);
    return;
  }
  const sb = getSupabase();
  const { error } = await sb
    .from("mailbox_credentials")
    .upsert(row, { onConflict: "user_email" });
  if (error) throw new Error(error.message);
}

export async function touchLastLogin(userEmail: string): Promise<void> {
  const now = new Date().toISOString();
  if (!dbConfigured()) {
    const existing = memory.get(userEmail);
    if (existing) existing.last_login_at = now;
    return;
  }
  const sb = getSupabase();
  await sb
    .from("mailbox_credentials")
    .update({ last_login_at: now })
    .eq("user_email", userEmail);
}

async function readRow(userEmail: string): Promise<MemoryRow | null> {
  if (!dbConfigured()) return memory.get(userEmail) ?? null;
  const sb = getSupabase();
  const { data, error } = await sb
    .from("mailbox_credentials")
    .select(
      "user_email, mailbox_address, jmap_password_encrypted, provisioned_at, last_login_at",
    )
    .eq("user_email", userEmail)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MemoryRow | null) ?? null;
}

// Helper exportado para tests / acciones que quieran limpiar la mock store.
export function _clearMemoryForTests() {
  memory.clear();
}
