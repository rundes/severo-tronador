// Tracking de cuotas — las cuotas son ciudadanos de primera clase (ARCHITECTURE
// §4). La cola chequea cuota ANTES de cada envío, no después.
//
// F3: el estado de uso vive en memoria (globalThis, sobrevive al HMR de dev).
// La persistencia real es la hoja `cuotas` en Google Sheets — un conector de
// escritura que se suma más adelante sin cambiar esta interfaz.

type UsageStore = Map<string, number>;

const g = globalThis as unknown as { __quotaUsage?: UsageStore };
const usage: UsageStore = (g.__quotaUsage ??= new Map());

export function getUsage(connectorId: string): number {
  return usage.get(connectorId) ?? 0;
}

export function incrementUsage(connectorId: string, n = 1): number {
  const next = getUsage(connectorId) + n;
  usage.set(connectorId, next);
  return next;
}

export function resetUsage(connectorId: string): void {
  usage.set(connectorId, 0);
}

// Primer día del mes siguiente (UTC) — reset del free tier mensual.
export function nextMonthlyReset(now = Date.now()): string {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
}
