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
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import {
  outreachConnectorById,
  OUTREACH_CONNECTOR_IDS,
  type EnvioQueueRow,
  type Campaign,
} from "@/lib/campaigns";
import type { Channel } from "@/lib/relationship";
import { enqueueSheetSync } from "@/lib/db/mirror";
import { getOrgUsage } from "@/lib/quota";
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
    if (auth !== `Bearer ${secret}`)
      return new Response("Forbidden", { status: 403 });
  } else if (process.env.NODE_ENV === "production") {
    return new Response("CRON_SECRET no configurado", { status: 403 });
  }
  if (!dbConfigured()) return NextResponse.json({ skipped: "no db" });

  const db = getSupabase();
  const nowIso = new Date().toISOString();

  // Colas SEPARADAS por proveedor: cada connector drena hasta BATCH filas por
  // corrida, en paralelo. Así una cola grande de un proveedor (ej. 1300 de
  // Resend) no tapa la de otro (Brevo), y cada uno respeta su propia cuota.
  // Iteramos los conectores CONOCIDOS (no una query "distinct", que el límite
  // de 1000 filas de PostgREST truncaría a un solo proveedor con mucha cola).
  const pending: PendingRow[] = [];
  for (const cid of OUTREACH_CONNECTOR_IDS) {
    const { data, error } = await db
      .from("envio_queue")
      .select("*")
      .eq("status", "pending")
      .eq("connector_id", cid)
      .lte("scheduled_at", nowIso)
      .order("created_at")
      .limit(BATCH);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    pending.push(...((data ?? []) as PendingRow[]));
  }

  let done = 0;
  let failed = 0;
  let rescheduled = 0;
  const touchedCampaigns = new Set<string>();

  let skippedByCondition = 0;
  let rescheduledByWindow = 0;

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

  for (const row of pending) {
    // Send-window del flow: si está fuera, reschedule al próximo inicio.
    if (row.flow_id) {
      const win = await getWindow(row.flow_id);
      if (win.startHour != null && win.endHour != null && !isInWindow(win)) {
        const next = nextWindowStart(win);
        await db
          .from("envio_queue")
          .update({
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
    // chequeamos ambos: la cuota del proyecto y la suma org-wide.
    const quota = await connector.getQuota(row.project_id);
    const orgUsed = await getOrgUsage(row.connector_id);
    if (quota.used >= quota.limit || orgUsed >= quota.limit) {
      // Reprogramar al reset de la cuota (diaria→mañana, mensual→mes que viene)
      // si es futuro; si no, reintento corto. Evita reintentar cada minuto un
      // tope que recién libera al cambiar de período.
      const retryAt =
        quota.resetAt && new Date(quota.resetAt).getTime() > Date.now()
          ? quota.resetAt
          : new Date(Date.now() + 60_000).toISOString();
      await db
        .from("envio_queue")
        .update({ scheduled_at: retryAt, last_error: "quota_blocked" })
        .eq("id", row.id);
      rescheduled++;
      continue;
    }

    try {
      const result = await connector.send(
        {
          subject: row.template.subject ?? undefined,
          body: row.template.body,
          replyTo:
            row.channel === "email" && isRepliesConfigured()
              ? buildReplyTo(row.token)
              : undefined,
        },
        row.contact,
        row.project_id,
      );

      // Fallo transitorio (rate limit / 5xx): no es un rechazo real del envío.
      // Lo tratamos como una excepción → backoff y reintento, sin insertar una
      // fila `envios` failed ni quemar la fila en el primer 429.
      if (!result.ok && result.retryable) {
        throw new Error(result.error ?? "retryable");
      }

      // Persistir envío en `envios` (lo que ve el dashboard de la campaña).
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
      const { error: envErr } = await db.from("envios").insert(envioRow);
      if (envErr) throw new Error(envErr.message);
      await enqueueSheetSync("envios", "upsert", envioRow);

      await db
        .from("envio_queue")
        .update({
          status: result.ok ? "done" : "failed",
          attempts: row.attempts + 1,
          provider_message_id: result.providerMessageId ?? null,
          last_error: result.ok ? null : result.error ?? "unknown",
          processed_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (result.ok) done++;
      else failed++;
      touchedCampaigns.add(row.campaign_id);
    } catch (e) {
      const msg = (e as Error).message;
      const newAttempts = row.attempts + 1;
      const isFinal = newAttempts >= MAX_ATTEMPTS;
      await db
        .from("envio_queue")
        .update({
          status: isFinal ? "failed" : "pending",
          attempts: newAttempts,
          last_error: msg,
          scheduled_at: isFinal
            ? null
            : new Date(Date.now() + backoffMs(newAttempts)).toISOString(),
          processed_at: isFinal ? new Date().toISOString() : null,
        })
        .eq("id", row.id);
      if (isFinal) {
        failed++;
        touchedCampaigns.add(row.campaign_id);
      } else {
        rescheduled++;
      }
    }

    // Espaciar el próximo envío para respetar el rate limit del proveedor.
    await sleep(SEND_DELAY_MS);
  }

  // Actualizar metrics + estado de las campañas tocadas. Si no queda nada
  // pending, cerrar a 'enviada'; si hay pending, marcar 'enviando'.
  for (const campaignId of touchedCampaigns) {
    await refreshCampaignState(db, campaignId);
  }

  log.info("cron.send_queue.tick", {
    done,
    failed,
    rescheduled,
    rescheduled_by_window: rescheduledByWindow,
    skipped_by_condition: skippedByCondition,
    batch: pending.length,
    campaigns_touched: touchedCampaigns.size,
  });
  return NextResponse.json({
    done,
    failed,
    rescheduled,
    rescheduled_by_window: rescheduledByWindow,
    skipped_by_condition: skippedByCondition,
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
      db
        .from("envio_queue")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("status", "pending"),
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
