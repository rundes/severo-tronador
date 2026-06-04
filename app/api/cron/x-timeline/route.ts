// Cron: drena la cola de handles de X (x_handle_queue) trayendo los
// últimos posteos de cada usuario hacia listening_items (escucha activa).
// En Vercel Hobby la frecuencia se gestiona vía GitHub Actions
// (.github/workflows/x-timeline.yml). Respeta el free tier de X.
import { NextResponse } from "next/server";
import { dbConfigured } from "@/lib/db/supabase";
import { processXHandleQueue } from "@/lib/x-timeline";
import { log } from "@/lib/logger";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (auth !== `Bearer ${secret}`) {
      return new Response("Forbidden", { status: 403 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return new Response("CRON_SECRET no configurado", { status: 403 });
  }
  if (!dbConfigured()) {
    return NextResponse.json({ skipped: "no db" });
  }

  const t0 = Date.now();
  try {
    const summary = await processXHandleQueue();
    const ms = Date.now() - t0;
    log.info("x_timeline.cron.ok", { ms, ...summary });
    return NextResponse.json({ ok: true, ms, ...summary });
  } catch (e) {
    log.error("x_timeline.cron.failed", { error: (e as Error).message });
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
