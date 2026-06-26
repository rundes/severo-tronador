"use server";
import { revalidatePath } from "next/cache";
import { getConnector } from "@/lib/connectors/registry";
import {
  saveConnectorConfig,
  deleteConnectorConfig,
  setEnabled,
  getConnectorConfig,
  type ConnectorConfigValues,
} from "@/lib/connectors/config";
import { invalidateConnectorHealth } from "@/lib/connectors/health";
import { requireMember } from "@/lib/workspace";

function valuesFromForm(connectorId: string, fd: FormData): ConnectorConfigValues {
  const schema = getConnector(connectorId)?.configSchema ?? [];
  const out: ConnectorConfigValues = {};
  for (const f of schema) {
    const v = fd.get(f.key);
    if (typeof v === "string") out[f.key] = v.trim();
  }
  return out;
}

export async function guardarConfig(
  connectorId: string,
  fd: FormData,
): Promise<{ ok: boolean; message?: string }> {
  await requireMember("owner"); // credenciales de conectores: sólo owners
  if (!getConnector(connectorId)) return { ok: false, message: "Conector desconocido" };
  try {
    await saveConnectorConfig(connectorId, valuesFromForm(connectorId, fd));
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  invalidateConnectorHealth(connectorId);
  revalidatePath("/conectores");
  return { ok: true };
}

export async function probarConexion(
  connectorId: string,
  fd: FormData,
): Promise<{ ok: boolean; message: string }> {
  await requireMember("owner");
  const connector = getConnector(connectorId);
  if (!connector) return { ok: false, message: "Conector desconocido" };
  try {
    await saveConnectorConfig(connectorId, valuesFromForm(connectorId, fd));
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  const res = await connector.test(await getConnectorConfig(connectorId));
  invalidateConnectorHealth(connectorId);
  revalidatePath("/conectores");
  return { ok: res.ok, message: res.message };
}

export async function toggleConector(connectorId: string, enabled: boolean) {
  await requireMember("owner");
  if (!getConnector(connectorId)) return;
  await setEnabled(connectorId, enabled);
  revalidatePath("/conectores");
}

export async function borrarConfig(connectorId: string) {
  await requireMember("owner");
  if (!getConnector(connectorId)) return;
  await deleteConnectorConfig(connectorId);
  invalidateConnectorHealth(connectorId);
  revalidatePath("/conectores");
}
