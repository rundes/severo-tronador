import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { encryptJson, decryptJson } from "@/lib/crypto";
import type { ConfigField } from "./types";

export type ConnectorConfigValues = Record<string, string>;

// Lazy dynamic import to break the circular dependency:
// registry → connector → config → registry.
// All callers are already async so awaiting here is fine.
async function schemaFields(connectorId: string): Promise<ConfigField[]> {
  const { getConnector } = await import("./registry");
  return getConnector(connectorId)?.configSchema ?? [];
}
async function isSecret(connectorId: string, key: string): Promise<boolean> {
  return (await schemaFields(connectorId)).some((f) => f.key === key && f.type === "secret");
}
async function envDefaults(connectorId: string): Promise<ConnectorConfigValues> {
  const out: ConnectorConfigValues = {};
  for (const f of await schemaFields(connectorId)) {
    const v = process.env[f.key];
    if (v) out[f.key] = v;
  }
  return out;
}

interface ConfigRow { connector_id: string; config: Record<string, string> | null; enabled: boolean | null; }

async function getRow(connectorId: string): Promise<ConfigRow | null> {
  if (!dbConfigured()) return null;
  const { data } = await getSupabase()
    .from("conector_config").select("*").eq("connector_id", connectorId).maybeSingle();
  return (data as ConfigRow) ?? null;
}

async function storedConfig(connectorId: string): Promise<ConnectorConfigValues> {
  const row = await getRow(connectorId);
  if (!row?.config) return {};
  const out: ConnectorConfigValues = {};
  for (const [k, v] of Object.entries(row.config)) {
    if (v == null || v === "") continue;
    out[k] = (await isSecret(connectorId, k)) ? await decryptJson<string>(v) : v;
  }
  return out;
}

export async function getConnectorConfig(connectorId: string): Promise<ConnectorConfigValues> {
  return { ...(await envDefaults(connectorId)), ...(await storedConfig(connectorId)) };
}

export async function saveConnectorConfig(connectorId: string, values: ConnectorConfigValues): Promise<void> {
  if (!dbConfigured()) throw new Error("Supabase/CONFIG_MASTER_KEY no configurado: no se puede guardar la config");
  const row = await getRow(connectorId);
  const config: Record<string, string> = { ...(row?.config ?? {}) };
  for (const f of await schemaFields(connectorId)) {
    const v = values[f.key];
    if (v === undefined) continue;
    if (f.type === "secret" && v === "") continue;
    if (v === "") { delete config[f.key]; continue; }
    config[f.key] = f.type === "secret" ? await encryptJson(v) : v;
  }
  const payload: Record<string, unknown> = { connector_id: connectorId, config, updated_at: new Date().toISOString() };
  if (!row) payload.enabled = true;
  const { error } = await getSupabase().from("conector_config").upsert(payload, { onConflict: "connector_id" });
  if (error) throw error;
}

export async function deleteConnectorConfig(connectorId: string): Promise<void> {
  if (!dbConfigured()) return;
  await getSupabase().from("conector_config").delete().eq("connector_id", connectorId);
}

export async function setEnabled(connectorId: string, enabled: boolean): Promise<void> {
  if (!dbConfigured()) throw new Error("Supabase no configurado");
  await getSupabase().from("conector_config").upsert(
    { connector_id: connectorId, enabled, updated_at: new Date().toISOString() },
    { onConflict: "connector_id" },
  );
}

export async function isEnabled(connectorId: string): Promise<boolean> {
  const row = await getRow(connectorId);
  if (!row) return true;
  return row.enabled !== false;
}

export interface FieldStatus {
  key: string; label: string; type: string; help?: string;
  required: boolean; placeholder?: string; hasValue: boolean; source: "ui" | "env" | "none";
}

export async function configFieldStatus(connectorId: string): Promise<FieldStatus[]> {
  const stored = (await getRow(connectorId))?.config ?? {};
  const env = await envDefaults(connectorId);
  return (await schemaFields(connectorId)).map((f) => {
    const inUi = stored[f.key] != null && stored[f.key] !== "";
    const inEnv = env[f.key] != null;
    return {
      key: f.key, label: f.label, type: f.type, help: f.help,
      required: f.required, placeholder: f.placeholder,
      hasValue: inUi || inEnv, source: inUi ? "ui" : inEnv ? "env" : "none",
    };
  });
}
