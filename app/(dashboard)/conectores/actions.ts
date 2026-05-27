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

function valuesFromForm(connectorId: string, fd: FormData): ConnectorConfigValues {
  const schema = getConnector(connectorId)?.configSchema ?? [];
  const out: ConnectorConfigValues = {};
  for (const f of schema) {
    const v = fd.get(f.key);
    if (typeof v === "string") out[f.key] = v.trim();
  }
  return out;
}

export async function guardarConfig(connectorId: string, fd: FormData) {
  if (!getConnector(connectorId)) return;
  await saveConnectorConfig(connectorId, valuesFromForm(connectorId, fd));
  revalidatePath("/conectores");
}

export async function probarConexion(
  connectorId: string,
  fd: FormData,
): Promise<{ ok: boolean; message: string }> {
  const connector = getConnector(connectorId);
  if (!connector) return { ok: false, message: "Conector desconocido" };
  await saveConnectorConfig(connectorId, valuesFromForm(connectorId, fd));
  const res = await connector.test(await getConnectorConfig(connectorId));
  revalidatePath("/conectores");
  return { ok: res.ok, message: res.message };
}

export async function toggleConector(connectorId: string, enabled: boolean) {
  if (!getConnector(connectorId)) return;
  await setEnabled(connectorId, enabled);
  revalidatePath("/conectores");
}

export async function borrarConfig(connectorId: string) {
  if (!getConnector(connectorId)) return;
  await deleteConnectorConfig(connectorId);
  revalidatePath("/conectores");
}
