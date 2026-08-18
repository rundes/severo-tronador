import { NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/crypto";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { appendRows, canExportSheets, rowFor } from "@/lib/sheets-export";
import { log } from "@/lib/logger";
import { recordHeartbeat } from "@/lib/heartbeat";

// 500 por tick: el drenaje ya no hace un request a Sheets por fila, sino uno
// por entidad presente en el lote, así que el techo lo pone el maxDuration y no
// la cuota por minuto de Google. Con el workflow de GH cada 15 min son ~48k
// filas/día. (Con el BATCH original de 50 y un solo tick diario de Vercel, una
// campaña de 1.300 envíos tardaba ~26 días en espejarse.)
const BATCH = 500;
const MAX_ATTEMPTS = 5;

interface QueueRow {
  id: string;
  entity: string;
  op: string;
  payload: Record<string, unknown>;
  attempts?: number | null;
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (!constantTimeEqual(auth ?? "", `Bearer ${secret}`)) return new Response("Forbidden", { status: 403 });
  } else if (process.env.NODE_ENV === "production") {
    // En producción nunca dejamos el endpoint abierto sin secret.
    return new Response("CRON_SECRET no configurado", { status: 403 });
  }
  if (!dbConfigured() || !canExportSheets()) {
    return NextResponse.json({ skipped: "no db o no sheets" });
  }
  const db = getSupabase();
  const { data } = await db.from("sheets_sync_queue")
    .select("*").eq("status", "pending").order("created_at").limit(BATCH);
  const rows = (data ?? []) as QueueRow[];

  let done = 0, failed = 0, unsupported = 0;

  // "remove" no está implementado en Sheets (borrar exige buscar la fila).
  // Antes se marcaba "done" sin tocar el Sheet: divergencia silenciosa. Status
  // honesto hasta implementarlo.
  const removes = rows.filter((r) => r.op !== "upsert");
  if (removes.length) {
    await db
      .from("sheets_sync_queue")
      .update({ status: "unsupported" })
      .in("id", removes.map((r) => r.id));
    unsupported = removes.length;
  }

  // Un request a Sheets por ENTIDAD, no por fila. El orden dentro de cada
  // entidad se conserva (la query viene ordenada por created_at).
  const byEntity = new Map<string, QueueRow[]>();
  for (const r of rows.filter((r) => r.op === "upsert")) {
    const list = byEntity.get(r.entity) ?? [];
    list.push(r);
    byEntity.set(r.entity, list);
  }

  for (const [entity, group] of byEntity) {
    try {
      await appendRows(
        entity,
        group.map((r) => rowFor(entity, r.payload, r.id)),
      );
      await db
        .from("sheets_sync_queue")
        .update({ status: "done" })
        .in("id", group.map((r) => r.id));
      done += group.length;
    } catch (e) {
      // El lote entero vuelve a pending (o muere si ya agotó los intentos). No
      // sabemos cuáles filas del append llegaron, así que el `_mirror_id` de
      // cada fila es lo que permite deduplicar al reconciliar.
      failed += group.length;
      const msg = (e as Error).message;
      log.warn("sheets.sync.batch_failed", { entity, rows: group.length, error: msg });
      for (const r of group) {
        const attempts = (r.attempts ?? 0) + 1;
        await db.from("sheets_sync_queue").update({
          status: attempts >= MAX_ATTEMPTS ? "error" : "pending",
          attempts,
          last_error: msg,
        }).eq("id", r.id);
      }
    }
  }

  log.info("cron.sheets_sync.tick", { done, failed, unsupported, batch: rows.length });
  await recordHeartbeat("sheets-sync", { done, failed, unsupported });
  return NextResponse.json({ done, failed, unsupported });
}
