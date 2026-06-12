// Re-encola filas de envio_queue que quedaron `failed` por un fallo TRANSITORIO
// de Resend (429 rate limit / 5xx) — antes de que el cron tratara esos casos
// como reintentables. Borra además la fila `envios` failed que el bug generó,
// para no contar un failed + un sent por contacto al reenviar.
//
// Auth: Bearer ${CRON_SECRET} (mismo patrón que send-queue). En prod sin secret
// devuelve 403.
//
// Default: DRY RUN (no muta) — reporta counts por last_error. Mutar requiere
// ?confirm=1. Idempotente: re-correrlo no duplica (las ya re-encoladas dejan de
// estar `failed`).
import { NextResponse } from "next/server";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";

export const maxDuration = 60;

// Solo 429 y 5xx son recuperables; un 4xx de validación (ej. 422) es rechazo
// permanente y NO se re-encola.
function isTransient(err: unknown): boolean {
  if (typeof err !== "string") return false;
  return err.startsWith("Resend HTTP 429") || /^Resend HTTP 5\d\d/.test(err);
}

interface FailedRow {
  id: string;
  token: string;
  last_error: string | null;
  campaign_id: string;
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

  const confirm = new URL(req.url).searchParams.get("confirm") === "1";
  const db = getSupabase();

  const { data, error } = await db
    .from("envio_queue")
    .select("id, token, last_error, campaign_id")
    .eq("status", "failed")
    .eq("connector_id", "resend");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as FailedRow[];
  const transient = rows.filter((r) => isTransient(r.last_error));

  const byError: Record<string, number> = {};
  for (const r of rows) {
    const k = r.last_error ?? "null";
    byError[k] = (byError[k] ?? 0) + 1;
  }

  if (!confirm) {
    return NextResponse.json({
      dry: true,
      failed_total: rows.length,
      requeueable: transient.length,
      byError,
    });
  }

  const nowIso = new Date().toISOString();
  const touched = new Set<string>();
  let requeued = 0;
  for (const r of transient) {
    // Borra el envío failed espurio (matcheamos por token, único por fila).
    await db.from("envios").delete().eq("token", r.token).eq("estado", "failed");
    await db
      .from("envio_queue")
      .update({
        status: "pending",
        attempts: 0,
        last_error: null,
        processed_at: null,
        scheduled_at: nowIso,
      })
      .eq("id", r.id);
    requeued++;
    touched.add(r.campaign_id);
  }

  return NextResponse.json({ requeued, campaigns: touched.size });
}
