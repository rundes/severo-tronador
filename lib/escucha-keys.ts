// Claves estables para items de escucha (feed/temas). Puro y sin imports de
// servidor → se puede usar tanto en server components como en el cliente
// (el monitor en vivo computa claves de items nuevos que llegan por polling).

// itemKey estable: hash djb2 simplificado de la semilla. Determinístico.
export function itemKey(seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h) ^ seed.charCodeAt(i);
    h = h >>> 0; // uint32
  }
  return h.toString(36).padStart(7, "0");
}

export function feedKey(item: { url?: string; text: string }): string {
  return itemKey(item.url || item.text);
}

export function topicKey(label: string): string {
  return itemKey("topic:" + label);
}

// Agrupa feed por día (YYYY-MM-DD UTC) según publishedAt; devuelve serie
// ordenada. Pura: misma entrada → misma salida.
export function volumeBuckets(
  items: { publishedAt?: string }[],
): { day: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item.publishedAt) continue;
    const ms = +new Date(item.publishedAt);
    if (Number.isNaN(ms) || ms <= 0) continue;
    // Fecha en UTC para ser determinístico sin importar la TZ del server.
    const d = new Date(ms);
    const day = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));
}
