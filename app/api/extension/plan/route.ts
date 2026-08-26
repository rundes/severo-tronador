// GET: plan de colecta para el plugin de Chrome (token por proyecto). El
// plugin no decide a quién mirar: baja este plan y navega. Incluye cuentas
// por plataforma (cada una con su `since`), búsquedas simétricas, presupuesto
// anti-bloqueo por plataforma y estado del circuit breaker (para no golpear
// una plataforma enfriada). El plugin ejecuta con jitter y concurrencia 1
// (spec §3); el shuffle de cuentas lo hace el plugin en runCollection.
import { NextResponse } from "next/server";
import { verifyExtensionToken } from "@/lib/extension-token";
import { getMonitorConfig } from "@/lib/monitor-config";
import { readBreakerState } from "@/lib/monitor-breaker";
import { sinceByAccount, accountKey, defaultSince } from "@/lib/extension-since";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const projectId = await verifyExtensionToken(
    auth.startsWith("Bearer ") ? auth.slice(7) : null,
  );
  if (!projectId) return new Response("Forbidden", { status: 403 });

  const [cfg, breaker] = await Promise.all([
    getMonitorConfig(projectId),
    readBreakerState(projectId),
  ]);

  // `since` por cuenta: el plugin filtra por fecha, nunca por posición.
  const since = await sinceByAccount(projectId, cfg.accounts);
  const accounts = cfg.accounts.map((a) => ({
    ...a,
    since: since[accountKey(a.platform, a.handle)] ?? defaultSince(),
  }));

  return NextResponse.json({
    accounts,
    searches: { a: cfg.searchesA, b: cfg.searchesB },
    budget: cfg.budget,
    // Plataformas enfriadas por el breaker: el plugin las saltea hasta cooldownUntil.
    cooldowns: breaker,
    // Horario plausible: el plugin ya lo respeta; se envía como recordatorio.
    ventanaHoraria: ["08:00", "01:00"],
  });
}
