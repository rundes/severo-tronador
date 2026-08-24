// Conectores que SÍ son `fuentes` togglables pero cuya ingesta corre fuera
// del cron de Vercel, en un worker de GitHub Actions con IP propia. GDELT
// limita a 1 request / 5 s por IP y desde la IP de egreso compartida de
// Vercel devuelve 429 al primer intento (infra/gdelt-worker/README.md).
// pullAllSources los salta; la lectura del feed los incluye igual.
//
// Módulo aparte (sin imports) para que lo usen lib/listening.ts y
// lib/listening-cache.ts sin ciclo entre ellos.
export const EXTERNALLY_INGESTED: ReadonlySet<string> = new Set(["gdelt"]);

export function isExternallyIngested(connectorId: string): boolean {
  return EXTERNALLY_INGESTED.has(connectorId);
}
