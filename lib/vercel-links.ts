// Deep-links al panel de Vercel (Web Analytics + Speed Insights), opcionalmente
// filtrados por ruta. La base del proyecto se configura con la env
// ANALYTICS_VERCEL_BASE, ej: "https://vercel.com/<equipo>/<proyecto>".
// OJO: el prefijo "VERCEL_" está reservado por Vercel (lo usa para sus vars de
// sistema) y una env custom con ese prefijo se ignora — por eso NO se llama
// VERCEL_*. Sin esta env no se generan links (el panel se llena igual en Vercel).
const BASE = process.env.ANALYTICS_VERCEL_BASE?.replace(/\/+$/, "") || "";

export function vercelConfigured(): boolean {
  return BASE.length > 0;
}

// Vercel Analytics filtra por ruta con ?path=<encoded>. Si no hay path, abre
// la vista general.
export function vercelAnalyticsUrl(path?: string): string | null {
  if (!BASE) return null;
  return path ? `${BASE}/analytics?path=${encodeURIComponent(path)}` : `${BASE}/analytics`;
}

export function vercelSpeedUrl(path?: string): string | null {
  if (!BASE) return null;
  return path ? `${BASE}/speed-insights?path=${encodeURIComponent(path)}` : `${BASE}/speed-insights`;
}
