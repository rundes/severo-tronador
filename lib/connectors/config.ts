// Config de conectores en DOS NIVELES (ver migracion 0053):
//   fila de organizacion (project_id null) -> credenciales compartidas, es
//     el fallback y desde el panel es de solo lectura.
//   fila del proyecto (project_id = <id>)  -> override, lo unico que escribe
//     el panel.
// Resolucion: env < organizacion < proyecto. Antes habia una sola fila por
// conector, asi que el owner de cualquier proyecto pisaba las API keys de
// todos los demas.
//
// `projectId` es opcional porque hay paths sin proyecto en contexto (crons de
// escucha, health checks): esos ven la config de organizacion, que es la que
// les corresponde.
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

interface ConfigRow {
  connector_id: string;
  project_id: string | null;
  config: Record<string, string> | null;
  enabled: boolean | null;
}

// Una fila puntual del nivel pedido. `projectId` null = fila de organizacion.
async function getRow(
  connectorId: string,
  projectId: string | null,
): Promise<ConfigRow | null> {
  if (!dbConfigured()) return null;
  let q = getSupabase()
    .from("conector_config")
    .select("*")
    .eq("connector_id", connectorId);
  q = projectId == null ? q.is("project_id", null) : q.eq("project_id", projectId);
  const { data } = await q.maybeSingle();
  return (data as ConfigRow) ?? null;
}

async function decodeConfig(
  connectorId: string,
  row: ConfigRow | null,
): Promise<ConnectorConfigValues> {
  if (!row?.config) return {};
  const out: ConnectorConfigValues = {};
  for (const [k, v] of Object.entries(row.config)) {
    if (v == null || v === "") continue;
    if (await isSecret(connectorId, k)) {
      try {
        out[k] = await decryptJson<string>(v);
      } catch {
        // Valor corrupto o CONFIG_MASTER_KEY cambiada: se omite este campo
        // (cae al default de env) en vez de romper toda la resolución.
        continue;
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function getConnectorConfig(
  connectorId: string,
  projectId?: string,
): Promise<ConnectorConfigValues> {
  const [env, org, project] = await Promise.all([
    envDefaults(connectorId),
    getRow(connectorId, null).then((r) => decodeConfig(connectorId, r)),
    projectId
      ? getRow(connectorId, projectId).then((r) => decodeConfig(connectorId, r))
      : Promise.resolve({} as ConnectorConfigValues),
  ]);
  return { ...env, ...org, ...project };
}

// Validaciones por conector ANTES de guardar (mensaje claro al usuario).
// Resend solo envía desde el dominio verificado: el From debe ser @tronador.net.ar
// (acepta "Nombre <x@tronador.net.ar>"). Sin esto, un From de otro dominio da 403.
const MAIL_DOMAIN = "tronador.net.ar";
function validateConnectorValues(connectorId: string, values: ConnectorConfigValues): void {
  if (connectorId === "resend" && values.RESEND_FROM) {
    const m = values.RESEND_FROM.match(/<([^>]+)>\s*$/);
    const email = (m ? m[1] : values.RESEND_FROM).trim().toLowerCase();
    if (!email.endsWith(`@${MAIL_DOMAIN}`)) {
      throw new Error(
        `El remitente (From) debe ser una dirección @${MAIL_DOMAIN} (el dominio verificado en Resend). Ej: relevamiento@${MAIL_DOMAIN}`,
      );
    }
  }
}

// Escribe SIEMPRE en la fila del proyecto: la de organizacion es el fallback
// compartido y desde el panel es de solo lectura. Asi un proyecto no puede
// pisarle las credenciales a otro.
export async function saveConnectorConfig(
  connectorId: string,
  projectId: string,
  values: ConnectorConfigValues,
): Promise<void> {
  if (!dbConfigured()) throw new Error("Supabase/CONFIG_MASTER_KEY no configurado: no se puede guardar la config");
  validateConnectorValues(connectorId, values);
  const row = await getRow(connectorId, projectId);
  const config: Record<string, string> = { ...(row?.config ?? {}) };
  for (const f of await schemaFields(connectorId)) {
    const v = values[f.key];
    if (v === undefined) continue;
    if (f.type === "secret" && v === "") continue;
    if (v === "") { delete config[f.key]; continue; }
    config[f.key] = f.type === "secret" ? await encryptJson(v) : v;
  }
  const payload: Record<string, unknown> = {
    connector_id: connectorId,
    project_id: projectId,
    config,
    updated_at: new Date().toISOString(),
  };
  if (!row) payload.enabled = true;
  const { error } = await getSupabase()
    .from("conector_config")
    .upsert(payload, { onConflict: "connector_id,project_id" });
  if (error) throw error;
}

// Borra las credenciales del override del proyecto. La fila de organizacion no
// se toca: es el fallback y borrarla dejaria sin conector a todos los demas
// proyectos.
//
// La fila del proyecto NO se borra: se vacia y queda con enabled=false. Si se
// borrara, `isEnabled` caeria al fallback de organizacion —que es `true` cuando
// no hay fila— y "Borrar config" terminaria REACTIVANDO el conector con las
// credenciales de la organizacion. Lo que el operador pidio es lo contrario.
export async function deleteConnectorConfig(
  connectorId: string,
  projectId: string,
): Promise<void> {
  if (!dbConfigured()) return;
  const { error } = await getSupabase().from("conector_config").upsert(
    {
      connector_id: connectorId,
      project_id: projectId,
      config: {},
      enabled: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connector_id,project_id" },
  );
  if (error) throw error;
}

export async function setEnabled(
  connectorId: string,
  projectId: string,
  enabled: boolean,
): Promise<void> {
  if (!dbConfigured()) throw new Error("Supabase no configurado");
  await getSupabase().from("conector_config").upsert(
    {
      connector_id: connectorId,
      project_id: projectId,
      enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connector_id,project_id" },
  );
}

// El toggle del proyecto gana sobre el de la organizacion; sin ninguna fila, un
// conector se considera habilitado.
//
// El default true es deliberado: el toggle existe para DESACTIVAR algo que ya
// funciona, y un conector sin credenciales corre en modo mock igual (no manda
// nada real). Lo que si era una trampa —que "Borrar config" reactivara el
// conector al desaparecer la fila— lo cierra deleteConnectorConfig, que deja la
// fila con enabled=false en vez de borrarla.
export async function isEnabled(
  connectorId: string,
  projectId?: string,
): Promise<boolean> {
  if (projectId) {
    const own = await getRow(connectorId, projectId);
    if (own?.enabled != null) return own.enabled !== false;
  }
  const org = await getRow(connectorId, null);
  if (!org) return true;
  return org.enabled !== false;
}

export interface FieldStatus {
  key: string; label: string; type: string; help?: string;
  required: boolean; placeholder?: string; hasValue: boolean; source: "ui" | "env" | "none";
  options?: { value: string; label: string }[];
}

export async function configFieldStatus(
  connectorId: string,
  projectId?: string,
): Promise<FieldStatus[]> {
  const [orgRow, projectRow, env] = await Promise.all([
    getRow(connectorId, null),
    projectId ? getRow(connectorId, projectId) : Promise.resolve(null),
    envDefaults(connectorId),
  ]);
  const stored = { ...(orgRow?.config ?? {}), ...(projectRow?.config ?? {}) };
  return (await schemaFields(connectorId)).map((f) => {
    const inUi = stored[f.key] != null && stored[f.key] !== "";
    const inEnv = env[f.key] != null;
    return {
      key: f.key, label: f.label, type: f.type, help: f.help,
      required: f.required, placeholder: f.placeholder, options: f.options,
      hasValue: inUi || inEnv, source: inUi ? "ui" : inEnv ? "env" : "none",
    };
  });
}
