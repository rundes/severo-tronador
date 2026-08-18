// Cron de envíos async — procesa filas pending de envio_queue, llama al
// connector correspondiente, inserta una fila en envios y actualiza
// metrics/estado de la campaña.
//
// Auth: Bearer ${CRON_SECRET} (mismo patrón que sheets-sync). En prod sin
// secret devuelve 403.
//
// Trigger: vercel.json declara el schedule, pero Vercel Hobby limita a 1
// ejecución/día. Para sub-daily usar Pro o trigger externo (GitHub Actions /
// Upstash QStash) golpeando este endpoint con el Bearer.
import { NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/crypto";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import {
  outreachConnectorById,
  OUTREACH_CONNECTOR_IDS,
  type EnvioQueueRow,
  type Campaign,
} from "@/lib/campaigns";
import type { Channel } from "@/lib/relationship";
import type { SendResult } from "@/lib/connectors/types";
import { enqueueSheetSync } from "@/lib/db/mirror";
import { getOrgUsage } from "@/lib/quota";
import { optedOutSet } from "@/lib/optout";
import { log } from "@/lib/logger";
import { shouldDispatch, type ConditionKind } from "@/lib/flows";
import { isInWindow, nextWindowStart } from "@/lib/send-window";
import { buildReplyTo, isRepliesConfigured } from "@/lib/mailbox/reply-address";
import { sleep } from "@/lib/sleep";

// Damos margen a la función: los envíos del batch son secuenciales (~300ms c/u
// con Resend), así que 50 ≈ 15s. maxDuration evita el corte a 10s del default.
export const maxDuration = 60;

// Envíos por corrida del cron. Default 50. Subilo con SEND_QUEUE_BATCH para
// despachar más rápido. Cada envío es secuencial; con 50 la corrida tarda ~15s
// (entra en maxDuration). Si una corrida se corta, las filas ya enviadas quedan
// marcadas y el resto sigue pendiente para la próxima.
const BATCH = Number(process.env.SEND_QUEUE_BATCH) || 50;
const MAX_ATTEMPTS = 3;

// Throttle entre envíos: Resend limita a ~2 req/seg por API key. Sin espaciar,
// el batch dispara ~3/seg y dispara 429/bounce. 500ms → ~1.3/seg con latencia.
// Ajustable con SEND_QUEUE_DELAY_MS (0 = sin pausa).
const SEND_DELAY_MS =
  process.env.SEND_QUEUE_DELAY_MS != null
    ? Number(process.env.SEND_QUEUE_DELAY_MS)
    : 500;

interface PendingRow {
  id: string;
  project_id: string;
  campaign_id: string;
  channel: Channel;
  connector_id: string;
  contact: EnvioQueueRow["contact"];
  template: EnvioQueueRow["template"];
  token: string;
  attempts: number;
  flow_id: string | null;
  flow_step_position: number | null;
  condition_kind: ConditionKind | null;
  variant_id: string | null;
}

function backoffMs(attempt: number): number {
  return Math.pow(2, attempt) * 60_000;
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (!constantTimeEqual(auth ?? "", `Bearer ${secret}`))
      return new Response("Forbidden", { status: 403 });
  } else if (process.env.NODE_ENV === "production") {
    return new Response("CRON_SECRET no configurado", { status: 403 });
  }
  if (!dbConfigured()) return NextResponse.json({ skipped: "no db" });

  const db = getSupabase();

  // Colas SEPARADAS por proveedor: cada connector drena hasta BATCH filas por
  // corrida, en paralelo. Así una cola grande de un proveedor (ej. 1300 de
  // Resend) no tapa la de otro (Brevo), y cada uno respeta su propia cuota.
  // Iteramos los conectores CONOCIDOS (no una query "distinct", que el límite
  // de 1000 filas de PostgREST truncaría a un solo proveedor con mucha cola).
  //
  // El lote se TOMA (claim), no se lee: el RPC marca las filas 'processing' con
  // FOR UPDATE SKIP LOCKED en la misma transacción, así dos ticks solapados se
  // reparten filas distintas en vez de enviar las mismas dos veces. `attempts`
  // ya viene incrementado por el claim.
  const pending: PendingRow[] = [];
  for (const cid of OUTREACH_CONNECTOR_IDS) {
    const { data, error } = await db.rpc("claim_envio_queue", {
      p_connector_id: cid,
      p_limit: BATCH,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    pending.push(...((data ?? []) as PendingRow[]));
  }

  let done = 0;
  let failed = 0;
  let dead = 0;
  let rescheduled = 0;
  const touchedCampaigns = new Set<string>();

  let skippedByCondition = 0;
  let rescheduledByWindow = 0;
  let skippedByOptOut = 0;

  // Bajas por proyecto, leídas una vez por tick. El opt-out se chequea al
  // ENCOLAR, pero una baja posterior (o un flow con steps a días vista) dejaba
  // pasar envíos a gente ya dada de baja: acá está el último punto de control
  // antes de tocar el connector.
  // Registro del envío (lo que ve el dashboard de la campaña). Idempotente por
  // el unique (campaign_id, token): si una corrida anterior ya lo registró, el
  // upsert no hace nada y no se duplica el espejo a Sheets.
  async function recordEnvio(row: PendingRow, result: SendResult) {
    const envioRow = {
      project_id: row.project_id,
      campaign_id: row.campaign_id,
      dni: row.contact.dni,
      nombre: `${row.contact.nombre} ${row.contact.apellido}`,
      destino:
        row.channel === "email"
          ? row.contact.email ?? "—"
          : row.contact.telefono ?? "—",
      estado: result.ok ? "sent" : "failed",
      reason: result.error ?? null,
      provider_message_id: result.providerMessageId ?? null,
      delivery: null,
      token: row.token,
      variant_id: row.variant_id ?? null,
      created_at: new Date().toISOString(),
    };
    const { data: inserted, error } = await db
      .from("envios")
      .upsert(envioRow, {
        onConflict: "campaign_id,token",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) {
      // No se puede reintentar el envío, así que se deja rastro y se sigue: la
      // fila de la cola guarda el provider_message_id para reconciliar.
      log.error("cron.send_queue.envio_persist_failed", {
        queue_id: row.id,
        campaign_id: row.campaign_id,
        error: error.message,
      });
      return;
    }
    if ((inserted ?? []).length > 0) {
      await enqueueSheetSync(row.project_id, "envios", "upsert", envioRow);
    }
  }

  const optOutCache = new Map<string, Set<string>>();
  async function optedOutIn(projectId: string): Promise<Set<string>> {
    const cached = optOutCache.get(projectId);
    if (cached) return cached;
    const set = await optedOutSet(projectId);
    optOutCache.set(projectId, set);
    return set;
  }

  // Cache de send-window por flow_id para no consultar N veces.
  const windowCache = new Map<
    string,
    { startHour: number | null; endHour: number | null }
  >();
  async function getWindow(flowId: string) {
    if (windowCache.has(flowId)) return windowCache.get(flowId)!;
    const { data } = await db
      .from("flows")
      .select("send_window_start_hour, send_window_end_hour")
      .eq("id", flowId)
      .maybeSingle();
    const w = {
      startHour: (data as { send_window_start_hour?: number | null } | null)?.send_window_start_hour ?? null,
      endHour: (data as { send_window_end_hour?: number | null } | null)?.send_window_end_hour ?? null,
    };
    windowCache.set(flowId, w);
    return w;
  }

  // Cache de cuota por tick: antes se leía getQuota + getOrgUsage por CADA fila
  // (hasta 100 round-trips con BATCH=50). limit/resetAt no cambian dentro del
  // tick; `used` arranca del valor de DB y lo incrementamos localmente por cada
  // envío contabilizado (conservador: cuenta el intento, así nunca sobre-envía).
  const quotaCache = new Map<
    string,
    { used: number; limit: number; resetAt?: string }
  >();
  const orgUsedCache = new Map<string, number>();

  for (const row of pending) {
    // Opt-out: última barrera antes del connector. Terminal (no reintenta) y
    // sin fila en `envios`, así que no cuenta como enviado ni como fallo.
    if ((await optedOutIn(row.project_id)).has(row.contact.dni)) {
      await db
        .from("envio_queue")
        .update({
          status: "done",
          claimed_at: null,
          last_error: "opt_out_skipped",
          processed_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      skippedByOptOut++;
      touchedCampaigns.add(row.campaign_id);
      continue;
    }

    // Send-window del flow: si está fuera, reschedule al próximo inicio.
    if (row.flow_id) {
      const win = await getWindow(row.flow_id);
      if (win.startHour != null && win.endHour != null && !isInWindow(win)) {
        const next = nextWindowStart(win);
        // Vuelve a 'pending' y devuelve el intento que consumió el claim: no se
        // tocó al proveedor, así que esto no gasta uno de los MAX_ATTEMPTS.
        await db
          .from("envio_queue")
          .update({
            status: "pending",
            attempts: row.attempts - 1,
            claimed_at: null,
            scheduled_at: next,
            last_error: "out_of_window",
          })
          .eq("id", row.id);
        rescheduledByWindow++;
        continue;
      }
    }
    // Drip flows: si el step tiene condición sobre respuestas previas, la
    // evaluamos antes de tocar el connector. Si no pasa, marcamos done con
    // status especial y seguimos.
    if (row.flow_id && row.condition_kind && row.condition_kind !== "always") {
      const allowed = await shouldDispatch({
        flow_id: row.flow_id,
        contact_dni: row.contact.dni,
        step_position: row.flow_step_position ?? 0,
        condition_kind: row.condition_kind,
      });
      if (!allowed) {
        await db
          .from("envio_queue")
          .update({
            status: "done",
            claimed_at: null,
            last_error: "condition_skipped",
            processed_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        skippedByCondition++;
        touchedCampaigns.add(row.campaign_id);
        continue;
      }
    }

    // Resolución por connector_id (no por canal): el email tiene 2 proveedores
    // (resend / brevo), así que cada fila se despacha por el conector con que
    // se encoló.
    const connector = outreachConnectorById(row.connector_id);
    if (!connector) {
      await db
        .from("envio_queue")
        .update({
          status: "failed",
          claimed_at: null,
          last_error: `connector ${row.connector_id} no registrado`,
          processed_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      failed++;
      touchedCampaigns.add(row.campaign_id);
      continue;
    }

    // Re-check quota antes de cada envío (per-project + org-wide). El límite
    // del free tier es compartido entre proyectos (key org-global), así que
    // chequeamos ambos: la cuota del proyecto y la suma org-wide. Leído una vez
    // por (connector, proyecto) / por connector y mantenido en memoria.
    const qKey = `${row.connector_id}|${row.project_id}`;
    let quota = quotaCache.get(qKey);
    if (!quota) {
      const fetched = await connector.getQuota(row.project_id);
      quota = {
        used: fetched.used,
        limit: fetched.limit,
        resetAt: fetched.resetAt ?? undefined,
      };
      quotaCache.set(qKey, quota);
    }
    // Clave de cuota del conector, NO su id: los de límite diario contabilizan
    // bajo `<id>:YYYY-MM-DD`, así que preguntar por `brevo` a secas devolvía
    // siempre 0 y el guard org-wide del free tier nunca frenaba nada.
    const orgKey = connector.quotaKey?.() ?? row.connector_id;
    let orgUsed = orgUsedCache.get(orgKey);
    if (orgUsed === undefined) {
      orgUsed = await getOrgUsage(orgKey);
      orgUsedCache.set(orgKey, orgUsed);
    }
    if (quota.used >= quota.limit || orgUsed >= quota.limit) {
      // Reprogramar al reset de la cuota (diaria→mañana, mensual→mes que viene)
      // si es futuro; si no, reintento corto. Evita reintentar cada minuto un
      // tope que recién libera al cambiar de período.
      const retryAt =
        quota.resetAt && new Date(quota.resetAt).getTime() > Date.now()
          ? quota.resetAt
          : new Date(Date.now() + 60_000).toISOString();
      // Igual que la ventana: se devuelve el intento del claim porque el
      // proveedor nunca se tocó.
      await db
        .from("envio_queue")
        .update({
          status: "pending",
          attempts: row.attempts - 1,
          claimed_at: null,
          scheduled_at: retryAt,
          last_error: "quota_blocked",
        })
        .eq("id", row.id);
      rescheduled++;
      continue;
    }
    // El try cubre SÓLO la llamada al proveedor. Un throw inesperado se trata
    // como fallo transitorio, igual que los que el connector ya clasifica.
    let result: SendResult;
    try {
      result = await connector.send(
        {
          subject: row.template.subject ?? undefined,
          body: row.template.body,
          replyTo:
            row.channel === "email" && isRepliesConfigured()
              ? buildReplyTo(row.token)
              : undefined,
          // El token identifica el envío de punta a punta: los proveedores que
          // soportan idempotencia lo usan para no mandar dos veces lo mismo.
          idempotencyKey: row.token,
        },
        row.contact,
        row.project_id,
      );
    } catch (e) {
      result = { ok: false, error: (e as Error).message, retryable: true };
    }

    // Fallo transitorio (rate limit / 5xx / red): no es un rechazo real del
    // envío. Backoff y reintento, sin insertar una fila `envios` failed ni
    // quemar la fila en el primer 429.
    if (!result.ok && result.retryable) {
      // `attempts` ya lo incrementó el claim.
      const isFinal = row.attempts >= MAX_ATTEMPTS;
      // Si el proveedor pidió una espera concreta, se respeta: reintentar antes
      // sólo hace que extienda el bloqueo.
      const waitMs =
        result.retryAfterSeconds != null
          ? result.retryAfterSeconds * 1000
          : backoffMs(row.attempts);
      await db
        .from("envio_queue")
        .update({
          // 'dead', no 'failed': el proveedor nunca rechazó el mensaje, nos
          // rendimos nosotros tras agotar los reintentos. Separarlos permite
          // encontrar y reintentar a mano lo que se cayó por una caída del
          // proveedor, sin mezclarlo con los rechazos legítimos.
          status: isFinal ? "dead" : "pending",
          claimed_at: null,
          last_error: result.error ?? "retryable",
          scheduled_at: isFinal
            ? null
            : new Date(Date.now() + waitMs).toISOString(),
          processed_at: isFinal ? new Date().toISOString() : null,
        })
        .eq("id", row.id);
      if (isFinal) {
        dead++;
        touchedCampaigns.add(row.campaign_id);
        // Sin esto el envío desaparecía de las métricas de la campaña: ni
        // enviado ni fallido, sólo una fila muerta en la cola.
        await recordEnvio(row, result);
      } else {
        rescheduled++;
      }
      await sleep(SEND_DELAY_MS);
      continue;
    }

    // Cerrar la fila ANTES de persistir el registro: el proveedor ya aceptó (o
    // rechazó) el mensaje y ese hecho es irreversible. Antes, un error en el
    // insert de `envios` caía al catch y reprogramaba la fila como pending →
    // el próximo tick volvía a mandar el mismo mensaje.
    await db
      .from("envio_queue")
      .update({
        status: result.ok ? "done" : "failed",
        claimed_at: null,
        provider_message_id: result.providerMessageId ?? null,
        last_error: result.ok ? null : result.error ?? "unknown",
        processed_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (result.ok) done++;
    else failed++;
    touchedCampaigns.add(row.campaign_id);

    // La cuota la incrementa el connector (RPC atómico) cuando el envío sale;
    // acá sólo mantenemos el espejo en memoria para no releerla en cada fila.
    // Antes se sumaba ANTES de llamar al proveedor y en cada reintento, así que
    // un tramo de 429 podía dejar la cuota "llena" sin haber enviado nada.
    if (result.ok) {
      quota.used++;
      orgUsedCache.set(orgKey, orgUsed + 1);
    }

    await recordEnvio(row, result);

    // Espaciar el próximo envío para respetar el rate limit del proveedor.
    await sleep(SEND_DELAY_MS);
  }

  // Actualizar metrics + estado de las campañas tocadas. Si no queda nada
  // pending, cerrar a 'enviada'; si hay pending, marcar 'enviando'.
  for (const campaignId of touchedCampaigns) {
    await refreshCampaignState(db, campaignId);
  }

  // Backlog de la dead-letter: sin este número, las filas agotadas se acumulan
  // sin que nadie se entere. Es la señal para mirar y reintentar a mano.
  const { count: deadBacklog } = await db
    .from("envio_queue")
    .select("*", { count: "exact", head: true })
    .eq("status", "dead");

  log.info("cron.send_queue.tick", {
    done,
    failed,
    dead,
    dead_backlog: deadBacklog ?? 0,
    rescheduled,
    rescheduled_by_window: rescheduledByWindow,
    skipped_by_condition: skippedByCondition,
    skipped_by_opt_out: skippedByOptOut,
    batch: pending.length,
    campaigns_touched: touchedCampaigns.size,
  });
  return NextResponse.json({
    done,
    failed,
    dead,
    dead_backlog: deadBacklog ?? 0,
    rescheduled,
    rescheduled_by_window: rescheduledByWindow,
    skipped_by_condition: skippedByCondition,
    skipped_by_opt_out: skippedByOptOut,
    batch: pending.length,
  });
}

async function refreshCampaignState(
  db: ReturnType<typeof getSupabase>,
  campaignId: string,
): Promise<void> {
  const { data: campRow } = await db
    .from("campanas")
    .select("metrics, estado")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campRow) return;

  const [{ count: pendingCount }, { count: sentCount }, { count: failedCount }] =
    await Promise.all([
      // 'processing' cuenta como pendiente: son filas tomadas por el tick en
      // curso. Sin eso, una campaña con todo el lote en vuelo se cerraría como
      // 'enviada' a mitad de camino.
      db
        .from("envio_queue")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .in("status", ["pending", "processing"]),
      db
        .from("envios")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("estado", "sent"),
      db
        .from("envios")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("estado", "failed"),
    ]);

  const metrics = campRow.metrics as Campaign["metrics"];
  const updated: Campaign["metrics"] = {
    ...metrics,
    sent: sentCount ?? 0,
    failed: failedCount ?? 0,
    enqueued: pendingCount ?? 0,
  };
  const estado: Campaign["estado"] =
    (pendingCount ?? 0) > 0 ? "enviando" : "enviada";

  await db
    .from("campanas")
    .update({ metrics: updated, estado })
    .eq("id", campaignId);
}
