// Dead-man's switch de los crons.
//
// Los 7 workflows críticos fallaban en silencio: si el endpoint devolvía 500,
// si el secret rotaba, o si GitHub deshabilitaba el `schedule` por 60 días sin
// actividad en el repo, la cola simplemente se paraba y nadie se enteraba —
// no hay señal en "algo que deja de pasar".
//
// Cada cron registra su latido al terminar bien. Un chequeo diario compara la
// última marca contra el intervalo esperado de cada job y avisa de los
// atrasados. Es al revés de un alerting sobre errores: acá la ausencia ES la
// señal.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { log } from "@/lib/logger";

// Cada cuánto se espera cada job, en minutos. La tolerancia (3×) evita ruido
// por un tick perdido suelto: sólo avisa cuando el job se paró de verdad.
export const CRON_INTERVALS_MIN: Record<string, number> = {
  "send-queue": 5,
  "sheets-sync": 15,
  "listening-pull": 60,
  "mail-sync": 15,
  reconcile: 60,
  "x-timeline": 60,
  retencion: 60 * 24,
};

const TOLERANCE_FACTOR = 3;

export interface StaleCron {
  job: string;
  lastSeenAt: string | null;
  expectedEveryMin: number;
  minutesSince: number | null;
}

// Marca que `job` corrió bien. Nunca tira: un fallo del latido no puede voltear
// el cron que sí funcionó.
export async function recordHeartbeat(
  job: string,
  details?: Record<string, unknown>,
): Promise<void> {
  if (!dbConfigured()) return;
  try {
    const { error } = await getSupabase()
      .from("cron_heartbeats")
      .upsert(
        {
          job,
          last_seen_at: new Date().toISOString(),
          details: details ?? {},
        },
        { onConflict: "job" },
      );
    if (error) log.warn("heartbeat.failed", { job, error: error.message });
  } catch (e) {
    log.warn("heartbeat.exception", { job, msg: (e as Error).message });
  }
}

// Jobs cuyo último latido quedó fuera de su ventana esperada. Un job que nunca
// latió también cuenta: puede que nunca se haya llegado a agendar.
export async function staleCrons(now = Date.now()): Promise<StaleCron[]> {
  if (!dbConfigured()) return [];
  const { data, error } = await getSupabase()
    .from("cron_heartbeats")
    .select("job, last_seen_at");
  if (error) throw error;
  const lastByJob = new Map<string, string>(
    (data ?? []).map((r) => [r.job as string, r.last_seen_at as string]),
  );

  const out: StaleCron[] = [];
  for (const [job, everyMin] of Object.entries(CRON_INTERVALS_MIN)) {
    const last = lastByJob.get(job) ?? null;
    const minutesSince = last
      ? Math.round((now - new Date(last).getTime()) / 60_000)
      : null;
    if (minutesSince == null || minutesSince > everyMin * TOLERANCE_FACTOR) {
      out.push({
        job,
        lastSeenAt: last,
        expectedEveryMin: everyMin,
        minutesSince,
      });
    }
  }
  return out;
}
