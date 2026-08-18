// Sink de errores del servidor.
//
// No había ninguno: un throw en una server action o en una ruta API se perdía
// en los logs de Vercel, mezclado con todo lo demás y sin nadie mirando. Esto
// da un punto único por donde pasan todos, con contexto normalizado.
//
// Sin dependencia de SDK a propósito: ERROR_WEBHOOK_URL acepta cualquier
// endpoint que reciba JSON (Slack, Discord, un ingest de Sentry, un webhook
// propio). Sin la variable, el error queda en el log estructurado, que ya es
// mejor que antes. Cambiar a @sentry/nextjs después es reemplazar esta función.
import { log } from "@/lib/logger";

export interface ErrorContext {
  // Dónde pasó: "route", "action", "cron", "webhook"…
  source: string;
  path?: string;
  method?: string;
  // Nunca datos personales acá: esto puede salir a un servicio externo.
  extra?: Record<string, unknown>;
}

// Recorta y normaliza: un stack completo en un webhook de Slack es ruido, y un
// mensaje de error puede traer un payload entero pegado.
function serializeError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return {
      message: err.message.slice(0, 500),
      stack: err.stack?.split("\n").slice(0, 12).join("\n"),
    };
  }
  return { message: String(err).slice(0, 500) };
}

export async function captureError(
  err: unknown,
  ctx: ErrorContext,
): Promise<void> {
  const { message, stack } = serializeError(err);
  log.error("server.error", {
    source: ctx.source,
    path: ctx.path,
    method: ctx.method,
    message,
    stack,
    ...ctx.extra,
  });

  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: `[${process.env.VERCEL_ENV ?? "local"}] ${ctx.source} ${ctx.path ?? ""}: ${message}`,
        source: ctx.source,
        path: ctx.path,
        method: ctx.method,
        message,
        stack,
        sha: (process.env.VERCEL_GIT_COMMIT_SHA ?? "dev").slice(0, 7),
      }),
      // El sink no puede colgar el request que lo llamó ni tirar por su cuenta.
      signal: AbortSignal.timeout(3000),
    });
  } catch (e) {
    log.warn("error_sink.failed", { msg: (e as Error).message });
  }
}
