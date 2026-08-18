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
import { ownerOfAddress } from "@/lib/mailbox/credentials";
import { DEFAULT_PROJECT_ID, listProjectsForEmail } from "@/lib/projects";
import { dbConfigured } from "@/lib/db/supabase";
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
  //
  // Atribución del proyecto, en orden: el del envío al que responde; si no, el
  // del dueño de la casilla @tronador destinataria. Antes todo lo que no fuera
  // un reply de campaña caía al proyecto default: el mail de un tenant
  // aterrizaba en la bandeja de otro. Si no se puede atribuir a nadie, no se
  // guarda — mejor perder un mail sin dueño que mostrárselo al equipo
  // equivocado; queda el warn para investigarlo.
  const toAddress = email.to[0]?.email ?? payload.to ?? null;
  const projectId =
    result.projectId ??
    (toAddress ? await projectForAddress(toAddress) : null) ??
    // Sin Supabase no hay casillas ni membresías que consultar: es el modo dev
    // en memoria, donde el único proyecto es el default.
    (dbConfigured() ? null : DEFAULT_PROJECT_ID);
  if (!projectId) {
    log.warn("mail.inbound.unattributed", {
      to: toAddress,
      from: email.from.email,
    });
    return NextResponse.json({ ok: false, reason: "unattributed" });
  }

  await storeInbound({
    projectId,
    messageId: email.id,
    fromEmail: email.from.email,
    fromName: email.from.name ?? null,
    toEmail: toAddress,
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

// Proyecto al que pertenece una casilla @tronador: el primero de su dueño. Un
// operador con varios proyectos recibe en el primero, que es el mismo criterio
// que usa el panel al elegir proyecto activo por defecto.
async function projectForAddress(address: string): Promise<string | null> {
  const owner = await ownerOfAddress(address);
  if (!owner) return null;
  const projects = await listProjectsForEmail(owner);
  return projects[0]?.id ?? null;
}
