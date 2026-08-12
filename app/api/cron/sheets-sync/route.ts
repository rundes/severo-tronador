import { NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/crypto";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { appendRow, canExportSheets } from "@/lib/sheets-export";

// 200 por tick: con el workflow de GH cada 15 min drena hasta ~19k filas/día.
// Con el BATCH anterior (50) y un solo tick diario de Vercel, una campaña de
// 1.300 envíos tardaba ~26 días en espejarse.
const BATCH = 200;
const MAX_ATTEMPTS = 5;

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
  const { data: rows } = await db.from("sheets_sync_queue")
    .select("*").eq("status", "pending").order("created_at").limit(BATCH);
  let done = 0, failed = 0, unsupported = 0;
  for (const row of rows ?? []) {
    try {
      if (row.op === "upsert") {
        await appendRow(row.entity, row.payload, row.id);
        await db.from("sheets_sync_queue").update({ status: "done" }).eq("id", row.id);
        done++;
      } else {
        // "remove" no está implementado en Sheets (borrar exige buscar la
        // fila). Antes se marcaba "done" sin tocar el Sheet: divergencia
        // silenciosa. Status honesto hasta implementarlo (plan F3).
        await db.from("sheets_sync_queue").update({ status: "unsupported" }).eq("id", row.id);
        unsupported++;
      }
    } catch (e) {
      failed++;
      const attempts = (row.attempts ?? 0) + 1;
      // Fila envenenada tras MAX_ATTEMPTS → status error, no bloquea la cola.
      await db.from("sheets_sync_queue").update({
        status: attempts >= MAX_ATTEMPTS ? "error" : "pending",
        attempts,
        last_error: (e as Error).message,
      }).eq("id", row.id);
      break; // backoff: cortar el batch ante el primer error, reintenta al próximo tick
    }
  }
  return NextResponse.json({ done, failed, unsupported });
}
