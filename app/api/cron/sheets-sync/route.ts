import { NextResponse } from "next/server";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { appendRow, canExportSheets } from "@/lib/sheets-export";

const BATCH = 50;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (auth !== `Bearer ${secret}`) return new Response("Forbidden", { status: 403 });
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
  let done = 0, failed = 0;
  for (const row of rows ?? []) {
    try {
      if (row.op === "upsert") await appendRow(row.entity, row.payload, row.id);
      await db.from("sheets_sync_queue").update({ status: "done" }).eq("id", row.id);
      done++;
    } catch (e) {
      failed++;
      await db.from("sheets_sync_queue").update({
        status: "pending", attempts: (row.attempts ?? 0) + 1,
        last_error: (e as Error).message,
      }).eq("id", row.id);
      break; // backoff: cortar el batch ante el primer error, reintenta al próximo tick
    }
  }
  return NextResponse.json({ done, failed });
}
