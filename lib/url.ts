// Devuelve la URL sólo si su scheme es http(s); si no, undefined. Evita que un
// href con scheme peligroso (`javascript:`, `data:`) llegue al DOM. Relevante
// porque item.url de escucha puede venir del <link> de un feed RSS externo, que
// se persiste sin sanitizar.
export function safeHttpUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}
