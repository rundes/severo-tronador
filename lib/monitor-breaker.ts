// Circuit breaker anti-bloqueo, persistido server-side por proyecto (spec
// §3.4). El plugin reporta una señal (429, checkpoint, captcha…) y el
// servidor enfría esa plataforma; el plan de colecta la excluye hasta que
// pase el cooldown. Sobrevive a reinicios del navegador porque vive en DB.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { log } from "@/lib/logger";
import type { Platform } from "@/lib/monitor-config";

export type BreakerSignal =
  | "http_429"
  | "http_401_403"
  | "checkpoint"
  | "try_later"
  | "captcha"
  | "empty_streak";

// Horas de enfriamiento por señal (spec §3.4).
const COOLDOWN_HOURS: Record<BreakerSignal, number> = {
  http_429: 48,
  http_401_403: 24,
  checkpoint: 48,
  try_later: 24,
  captcha: 48,
  empty_streak: 24,
};

export type BreakerState = Partial<Record<Platform, { until: string; signal: BreakerSignal }>>;

const key = (projectId: string) => `monitor-breaker:${projectId}`;

export async function readBreakerState(projectId: string): Promise<BreakerState> {
  if (!dbConfigured()) return {};
  const { data } = await getSupabase()
    .from("conector_config")
    .select("config")
    .eq("connector_id", key(projectId))
    .maybeSingle();
  const state = (data?.config as BreakerState | undefined) ?? {};
  // Descartar cooldowns ya vencidos.
  const now = Date.now();
  const active: BreakerState = {};
  for (const [plat, v] of Object.entries(state)) {
    if (v && +new Date(v.until) > now) active[plat as Platform] = v;
  }
  return active;
}

export async function tripBreaker(
  projectId: string,
  platform: Platform,
  signal: BreakerSignal,
): Promise<void> {
  if (!dbConfigured()) return;
  const state = await readBreakerState(projectId);
  const until = new Date(Date.now() + COOLDOWN_HOURS[signal] * 3600_000).toISOString();
  state[platform] = { until, signal };
  const { error } = await getSupabase().from("conector_config").upsert(
    {
      connector_id: key(projectId),
      config: state,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connector_id" },
  );
  if (error) log.warn("monitor_breaker.save_failed", { error: error.message });
  else log.info("monitor_breaker.tripped", { projectId, platform, signal, until });
}
