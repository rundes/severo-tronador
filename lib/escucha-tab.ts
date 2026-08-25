// Tab activa de /escucha. "config" quedó como alias de "escenario" para links
// viejos (favoritos, mails).
export type EscuchaTab = "escenario" | "monitor" | "informe";

export function resolveTab(param: string | undefined): EscuchaTab {
  if (param === "escenario" || param === "config") return "escenario";
  if (param === "informe") return "informe";
  return "monitor";
}
