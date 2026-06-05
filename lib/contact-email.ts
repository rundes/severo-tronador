// Envío del formulario de contacto del landing. Usa Resend (mismo
// connector que el resto). Destinatario fijo: contacto@tronador.net.ar
// (cae en la bandeja in-app vía Cloudflare Email Routing).
import { log } from "@/lib/logger";

const CONTACT_TO = "contacto@tronador.net.ar";

export interface ContactPayload {
  name: string;
  email: string;
  message: string;
}

export async function sendContactEmail(
  payload: ContactPayload,
): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? "relevamiento@tronador.net.ar";
  if (!key) {
    log.warn("contact.no_resend_key");
    return { ok: false, error: "email service no configurado" };
  }

  const subject = `Tronador · contacto de ${payload.name}`;
  const text = [
    `Nombre: ${payload.name}`,
    `Email: ${payload.email}`,
    "",
    payload.message,
  ].join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: CONTACT_TO,
        subject,
        text,
        reply_to: payload.email,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      log.warn("contact.resend_failed", { status: res.status, detail });
      return { ok: false, error: `resend http ${res.status}` };
    }
    log.info("contact.sent", { from_email: payload.email });
    return { ok: true };
  } catch (err) {
    log.error("contact.exception", { msg: (err as Error).message });
    return { ok: false, error: (err as Error).message };
  }
}
