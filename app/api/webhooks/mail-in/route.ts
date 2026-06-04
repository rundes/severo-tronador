// Webhook de mail entrante desde Cloudflare Email Workers.
// El Worker recibe el mail por MX, lo pipea raw a este endpoint
// con HMAC-SHA256 de body usando MAIL_INBOUND_SECRET.
//
// Plan 04 F5 alternativo (sin Stalwart): ruta replies de campañas
// emitidas con replyTo=replies+<token>@tronador a respuestas.
import { NextResponse } from "next/server";
import { verifyHmacSha256 } from "@/lib/crypto";
import { parseRawEmail } from "@/lib/mailbox/inbound-parser";
import { routeReply } from "@/lib/mailbox/reply-routing";
import { storeInbound } from "@/lib/mailbox/inbox-store";
import { DEFAULT_PROJECT_ID } from "@/lib/projects";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const bodyText = await req.text();
  const sig = req.headers.get("x-tronador-signature");
  const secret = process.env.MAIL_INBOUND_SECRET;

  if (!secret) {
    log.warn("mail.inbound.no_secret");
    return new Response("MAIL_INBOUND_SECRET no configurado", { status: 503 });
  }
  if (!verifyHmacSha256(bodyText, sig, secret)) {
    log.warn("mail.inbound.signature_failed", {
      has_header: Boolean(sig),
    });
    return new Response("Forbidden", { status: 403 });
  }

  let payload: { raw?: string; to?: string; from?: string };
  try {
    payload = JSON.parse(bodyText) as typeof payload;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  if (!payload.raw) {
    return NextResponse.json({ ok: false, error: "no_raw" }, { status: 400 });
  }

  const email = await parseRawEmail(payload.raw);
  // Si el Worker mandó la dirección To explícita (Cloudflare la expone
  // antes del parse) y el parse no la pudo recuperar, fallback.
  if (email.to.length === 0 && payload.to) {
    email.to = [{ email: payload.to }];
  }

  const result = await routeReply(email);

  // Guardar el entrante en la bandeja in-app (modo Cloudflare+Resend).
  // Si fue un reply de campaña usamos su proyecto; si no, el default.
  await storeInbound({
    projectId: result.projectId ?? DEFAULT_PROJECT_ID,
    messageId: email.id,
    fromEmail: email.from.email,
    fromName: email.from.name ?? null,
    toEmail: email.to[0]?.email ?? payload.to ?? null,
    subject: email.subject,
    bodyText: email.bodyText,
    bodyHtml: email.bodyHtml ?? null,
    receivedAt: email.receivedAt,
  });

  log.info("mail.inbound.routed", {
    ok: result.ok,
    reason: result.reason,
    token: result.envioToken,
  });

  return NextResponse.json({
    ok: result.ok,
    reason: result.reason ?? null,
    respuestaId: result.respuestaId ?? null,
  });
}
