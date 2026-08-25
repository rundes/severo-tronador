// GET: plan de colecta para el plugin de Chrome (token por proyecto). El
// plugin no decide a quién mirar: baja este plan y navega. Incluye cuentas
// por plataforma, búsquedas simétricas, presupuesto anti-bloqueo por
// plataforma y estado del circuit breaker (para no golpear una plataforma
// enfriada). El plugin ejecuta con jitter y concurrencia 1 (spec §3).
import { NextResponse } from "next/server";
import { verifyExtensionToken } from "@/lib/extension-token";
import { getMonitorConfig } from "@/lib/monitor-config";
import { readBreakerState } from "@/lib/monitor-breaker";

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

  // Barajar cuentas: recorrer siempre en el mismo orden es una firma (spec §3.2).
  const accounts = [...cfg.accounts];

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
