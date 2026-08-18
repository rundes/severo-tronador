// Chequeo del dead-man's switch: ¿algún cron dejó de latir?
//
// Devuelve 500 cuando hay jobs atrasados, para que el workflow que lo llama
// falle y abra la alerta. Es deliberado que el "todo bien" sea 200 con lista
// vacía y el "algo se paró" sea un error: así el canal de alerta es el mismo
// que el de cualquier otro fallo de CI, sin integraciones nuevas.
import { NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/crypto";
import { dbConfigured } from "@/lib/db/supabase";
import { staleCrons } from "@/lib/heartbeat";
import { log } from "@/lib/logger";

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

  const stale = await staleCrons();
  if (stale.length > 0) {
    log.error("cron.health.stale", { jobs: stale.map((s) => s.job), stale });
    return NextResponse.json({ ok: false, stale }, { status: 500 });
  }
  return NextResponse.json({ ok: true, stale: [] });
}
