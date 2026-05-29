// Cron de mail sync (Plan 04 F5): auto-routing de replies a respuestas.
// Pateado por GitHub Actions cada 10min (Vercel Hobby: 1 cron/día max).
import { NextResponse } from "next/server";
import { syncReplies } from "@/lib/mailbox/mail-sync";
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

  const t0 = Date.now();
  try {
    const summary = await syncReplies(50);
    return NextResponse.json({ ok: true, ms: Date.now() - t0, ...summary });
  } catch (e) {
    log.error("mail.sync.failed", { error: (e as Error).message });
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
