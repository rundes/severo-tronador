// Tab activa de /escucha. Orden de lectura: Informe (la síntesis, default) →
// Monitoreo (las métricas) → Entorno (la configuración).
// Aliases para links viejos (favoritos, mails, redirects de actions):
// "escenario" y "config" → entorno; "monitor" → monitoreo.
export type EscuchaTab = "informe" | "monitoreo" | "entorno";

export function resolveTab(param: string | undefined): EscuchaTab {
  if (param === "entorno" || param === "escenario" || param === "config") return "entorno";
  if (param === "monitoreo" || param === "monitor") return "monitoreo";
  return "informe";
}
