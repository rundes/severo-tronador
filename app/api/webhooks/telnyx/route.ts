// Webhook de Telnyx (SMS Messaging).
// POST — eventos de mensajería. Para entrega (`message.finalized` / `message.sent`)
//        se mapea el estado por destinatario y se escribe en el envío
//        correspondiente por providerMessageId (data.payload.id).
// Seguridad: firma Ed25519 del payload `${timestamp}|${rawBody}` validada con
// TELNYX_PUBLIC_KEY (clave pública base64 del portal). Headers
// `telnyx-signature-ed25519` y `telnyx-timestamp`.
import { NextResponse } from "next/server";
import { updateEnvioStatus, type Envio } from "@/lib/campaigns";
import { verifyTelnyxSignature } from "@/lib/crypto";
import { log } from "@/lib/logger";

// Estados de entrega de Telnyx → estado interno. `sent`/`queued`/`sending` se
// ignoran (estados intermedios sin equivalente). SMS no tiene "read".
const STATUS_MAP: Record<string, NonNullable<Envio["delivery"]>> = {
  delivered: "delivered",
  delivery_failed: "failed",
  sending_failed: "failed",
  expired: "failed",
};

interface TelnyxWebhookBody {
  data?: {
    event_type?: string;
    payload?: {
      id?: string;
      to?: { status?: string }[];
    };
  };
}

export async function POST(req: Request) {
  const raw = Buffer.from(await req.arrayBuffer());
  const signature = req.headers.get("telnyx-signature-ed25519");
  const timestamp = req.headers.get("telnyx-timestamp");
  const publicKey = process.env.TELNYX_PUBLIC_KEY;

  if (!verifyTelnyxSignature(raw, signature, timestamp, publicKey)) {
    log.warn("webhook.telnyx.signature_failed", {
      has_signature: Boolean(signature),
      has_timestamp: Boolean(timestamp),
      has_key: Boolean(publicKey),
    });
    return new Response("Forbidden", { status: 403 });
  }

  let body: TelnyxWebhookBody;
  try {
    body = JSON.parse(raw.toString("utf8")) as TelnyxWebhookBody;
  } catch {
    log.warn("webhook.telnyx.bad_json");
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const payload = body.data?.payload;
  let updated = 0;
  if (payload?.id) {
    for (const dest of payload.to ?? []) {
      const mapped = dest.status ? STATUS_MAP[dest.status] : undefined;
      if (mapped && (await updateEnvioStatus(payload.id, mapped))) updated++;
    }
  }
  log.info("webhook.telnyx.processed", {
    event: body.data?.event_type,
    updated,
  });
  return NextResponse.json({ ok: true, updated });
}
