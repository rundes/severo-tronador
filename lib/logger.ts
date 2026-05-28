// Logger estructurado (#15 STABILIZATION). Emite JSON por línea a stdout —
// Vercel lo ingesta y queda buscable en Logs. Diseñado para ser zero-dep y
// no acoplar a un SDK específico (Pino/Winston) hasta tener requirements
// concretos de retention y query.
//
// Uso:
//   import { log } from "@/lib/logger";
//   log.info("cron.tick", { batch: 20, done: 18 });
//   log.warn("quota.near_limit", { connectorId: "resend", used: 2900 });
//   log.error("webhook.signature_failed", { hash: "..." });
//
// Niveles: debug | info | warn | error. En prod debug se omite.

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const LEVEL_ORDER: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function minLevel(): number {
  const env = (process.env.LOG_LEVEL ?? "").toLowerCase() as Level;
  if (env in LEVEL_ORDER) return LEVEL_ORDER[env];
  return process.env.NODE_ENV === "production" ? LEVEL_ORDER.info : LEVEL_ORDER.debug;
}

function emit(level: Level, event: string, fields: Fields = {}): void {
  if (LEVEL_ORDER[level] < minLevel()) return;
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    event,
    env: process.env.VERCEL_ENV ?? "local",
    sha: (process.env.VERCEL_GIT_COMMIT_SHA ?? "dev").slice(0, 7),
    ...fields,
  });
  // Mapea a console.* para que Vercel use el nivel correcto en su panel.
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields?: Fields) => emit("debug", event, fields),
  info: (event: string, fields?: Fields) => emit("info", event, fields),
  warn: (event: string, fields?: Fields) => emit("warn", event, fields),
  error: (event: string, fields?: Fields) => emit("error", event, fields),
};
