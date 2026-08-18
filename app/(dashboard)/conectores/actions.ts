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
  // Credenciales de conectores: sólo owners, y siempre sobre el override del
  // proyecto activo — la fila de organización es el fallback compartido.
  const { id: projectId } = await requireMember("owner");
  if (!getConnector(connectorId)) return { ok: false, message: "Conector desconocido" };
  try {
    await saveConnectorConfig(connectorId, projectId, valuesFromForm(connectorId, fd));
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
  const { id: projectId } = await requireMember("owner");
  const connector = getConnector(connectorId);
  if (!connector) return { ok: false, message: "Conector desconocido" };
  try {
    await saveConnectorConfig(connectorId, projectId, valuesFromForm(connectorId, fd));
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  const res = await connector.test(await getConnectorConfig(connectorId, projectId));
  invalidateConnectorHealth(connectorId);
  revalidatePath("/conectores");
  return { ok: res.ok, message: res.message };
}

export async function toggleConector(connectorId: string, enabled: boolean) {
  const { id: projectId } = await requireMember("owner");
  if (!getConnector(connectorId)) return;
  await setEnabled(connectorId, projectId, enabled);
  revalidatePath("/conectores");
}

export async function borrarConfig(connectorId: string) {
  const { id: projectId } = await requireMember("owner");
  if (!getConnector(connectorId)) return;
  await deleteConnectorConfig(connectorId, projectId);
  invalidateConnectorHealth(connectorId);
  revalidatePath("/conectores");
}
