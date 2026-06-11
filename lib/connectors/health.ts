// Cache de salud de conectores — resultado real de test() con TTL de 5 minutos.
// Corre sólo en el servidor (server components / route handlers). No persiste
// entre reinicios del proceso ni se comparte entre instancias de serverless.
import { getConnector } from "./registry";

export interface ConnectorHealth {
  ok: boolean;
  message: string;
  checkedAt: number;
}

const TTL_MS = 300_000; // 5 minutos

// Módulo-level cache: connectorId → ConnectorHealth
const cache = new Map<string, ConnectorHealth>();

/**
 * Devuelve el resultado de test() del conector, cacheado por TTL.
 * - Si el conector no existe o no tiene test → null.
 * - Si el estado cacheado es fresco (<5 min) → devuelve el cache.
 * - De lo contrario, llama test() y actualiza el cache.
 */
export async function getConnectorHealth(
  connectorId: string,
): Promise<ConnectorHealth | null> {
  const connector = getConnector(connectorId);
  if (!connector) return null;

  const now = Date.now();
  const cached = cache.get(connectorId);
  if (cached && now - cached.checkedAt < TTL_MS) {
    return cached;
  }

  let result: ConnectorHealth;
  try {
    const testResult = await connector.test();
    result = { ok: testResult.ok, message: testResult.message, checkedAt: now };
  } catch (err) {
    result = {
      ok: false,
      message: `Error al probar: ${(err as Error).message}`,
      checkedAt: now,
    };
  }

  cache.set(connectorId, result);
  return result;
}

/**
 * Elimina la entrada de cache del conector para forzar un nuevo test() en la
 * próxima solicitud. Llamar después de guardar nueva configuración.
 */
export function invalidateConnectorHealth(connectorId: string): void {
  cache.delete(connectorId);
}
