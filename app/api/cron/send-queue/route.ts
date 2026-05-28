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
  outreachConnectorFor,
  type EnvioQueueRow,
  type Campaign,
} from "@/lib/campaigns";
import type { Channel } from "@/lib/relationship";
import { enqueueSheetSync } from "@/lib/db/mirror";

const BATCH = 20;
const MAX_ATTEMPTS = 3;

interface PendingRow {
  id: string;
  campaign_id: string;
  channel: Channel;
  connector_id: string;
  contact: EnvioQueueRow["contact"];
  template: EnvioQueueRow["template"];
  token: string;
  attempts: number;
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
  const { data: rows, error } = await db
    .from("envio_queue")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("created_at")
    .limit(BATCH);
  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }
  const pending = (rows ?? []) as PendingRow[];

  let done = 0;
  let failed = 0;
  let rescheduled = 0;
  const touchedCampaigns = new Set<string>();

  for (const row of pending) {
    const connector = outreachConnectorFor(row.channel);
    if (!connector || connector.id !== row.connector_id) {
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

    // Re-check quota antes de cada envío. Si está llena, posponer +1 min.
    const quota = await connector.getQuota();
    if (quota.used >= quota.limit) {
      await db
        .from("envio_queue")
        .update({
          scheduled_at: new Date(Date.now() + 60_000).toISOString(),
          last_error: "quota_blocked",
        })
        .eq("id", row.id);
      rescheduled++;
      continue;
    }

    try {
      const result = await connector.send(
        {
          subject: row.template.subject ?? undefined,
          body: row.template.body,
        },
        row.contact,
      );

      // Persistir envío en `envios` (lo que ve el dashboard de la campaña).
      const envioRow = {
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
  }

  // Actualizar metrics + estado de las campañas tocadas. Si no queda nada
  // pending, cerrar a 'enviada'; si hay pending, marcar 'enviando'.
  for (const campaignId of touchedCampaigns) {
    await refreshCampaignState(db, campaignId);
  }

  return NextResponse.json({
    done,
    failed,
    rescheduled,
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
