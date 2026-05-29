// Send-window: evita despachar envíos fuera de la ventana horaria que
// el flow declara (Plan 02 — F5). Default sin ventana = siempre disparar.
//
// Hora UTC para simplicidad (todos los destinatarios de un flow comparten
// la misma ventana). Si start <= end, ventana directa (ej 12-22).
// Si start > end, ventana cruza medianoche (ej 22-06).

export interface SendWindow {
  startHour: number | null;
  endHour: number | null;
}

export function isInWindow(
  window: SendWindow,
  now = new Date(),
): boolean {
  const { startHour, endHour } = window;
  if (startHour == null || endHour == null) return true;
  const h = now.getUTCHours();
  if (startHour <= endHour) {
    return h >= startHour && h < endHour;
  }
  // Cruza medianoche.
  return h >= startHour || h < endHour;
}

// Devuelve ISO timestamp del próximo inicio de ventana. Asume que NO
// estamos dentro (sino isInWindow ya hubiera autorizado).
export function nextWindowStart(
  window: SendWindow,
  now = new Date(),
): string {
  const { startHour } = window;
  if (startHour == null) return now.toISOString();
  const next = new Date(now);
  next.setUTCMinutes(0);
  next.setUTCSeconds(0);
  next.setUTCMilliseconds(0);
  next.setUTCHours(startHour);
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.toISOString();
}
