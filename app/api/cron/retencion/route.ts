// Pruning de datos con retención vencida. Llama al RPC prune_retencion, que es
// donde vive la política (ver supabase/migrations/0056_retencion.sql).
//
// Existe además del agendado por pg_cron porque no todos los proyectos Supabase
// tienen la extensión (o el permiso para agendar). Correrlo dos veces no hace
// daño: el segundo pasada no encuentra nada que borrar.
import { NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/crypto";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { log } from "@/lib/logger";
import { recordHeartbeat } from "@/lib/heartbeat";

export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (!constantTimeEqual(auth ?? "", `Bearer ${secret}`)) {
      return new Response("Forbidden", { status: 403 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return new Response("CRON_SECRET no configurado", { status: 403 });
  }
  if (!dbConfigured()) return NextResponse.json({ skipped: "no db" });

  const { data, error } = await getSupabase().rpc("prune_retencion");
  if (error) {
    log.error("cron.retencion.failed", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const deleted = (data ?? {}) as Record<string, number>;
  log.info("cron.retencion.tick", deleted);
  await recordHeartbeat("retencion", deleted);
  return NextResponse.json({ deleted });
}
