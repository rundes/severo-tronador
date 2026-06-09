// Deep-links al panel de Vercel (Web Analytics + Speed Insights), opcionalmente
// filtrados por ruta. La base del proyecto se configura con la env
// VERCEL_ANALYTICS_BASE, ej: "https://vercel.com/<equipo>/<proyecto>".
// Sin esa env no se generan links (el panel sigue llenándose igual en Vercel).
const BASE = process.env.VERCEL_ANALYTICS_BASE?.replace(/\/+$/, "") || "";

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
