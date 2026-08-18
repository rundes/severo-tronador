// Cron de reconciliación de estados de envío (#8 STABILIZATION).
//
// Webhooks de provider se pierden cada tanto (retry policy del provider falla,
// nuestro endpoint vuelve 5xx un par de segundos, etc). Este cron pasa cada
// tanto y mide la divergencia: envíos sent > 1h ago con provider_message_id
// pero sin delivery. Si pasa el umbral (>2%) emite warning.
//
// Además de medir, corrige activamente lo que se puede: email vía pull a la
// API de Resend (GET /emails/{id} → last_event). WhatsApp Cloud es
// webhook-only (no hay endpoint de consulta por wamid), para ese canal la
// divergencia solo se reporta.
import { NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/crypto";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { reconcileResendDeliveries } from "@/lib/reconcile";
import { log } from "@/lib/logger";
import { recordHeartbeat } from "@/lib/heartbeat";

// Solo emitimos warn si la divergencia supera este ratio.
const WARN_RATIO = 0.02;
// Envíos más viejos que esto son candidatos a estar "perdidos".
const STALE_MS = 60 * 60 * 1000;

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

  // Pull activo primero: corrige lo corregible antes de medir divergencia.
  const resend = await reconcileResendDeliveries();

  const db = getSupabase();
  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();

  // Total de envíos sent con id de provider en la ventana de auditoría.
  const total = await db
    .from("envios")
    .select("*", { count: "exact", head: true })
    .eq("estado", "sent")
    .not("provider_message_id", "is", null)
    .lte("created_at", staleBefore);

  // De esos, los que NO tienen delivery seteado por webhook.
  const missing = await db
    .from("envios")
    .select("*", { count: "exact", head: true })
    .eq("estado", "sent")
    .not("provider_message_id", "is", null)
    .is("delivery", null)
    .lte("created_at", staleBefore);

  const totalCount = total.count ?? 0;
  const missingCount = missing.count ?? 0;
  const ratio = totalCount > 0 ? missingCount / totalCount : 0;
  const alert = ratio > WARN_RATIO;

  const event = "cron.reconcile.tick";
  const payload = {
    total: totalCount,
    missing: missingCount,
    ratio: Math.round(ratio * 10000) / 100,
    stale_ms: STALE_MS,
    threshold: WARN_RATIO,
    resend_checked: resend.checked,
    resend_corrected: resend.corrected,
  };
  if (alert) log.warn(event, payload);
  else log.info(event, payload);

  await recordHeartbeat("reconcile", { alert });
  return NextResponse.json({ ...payload, alert });
}
