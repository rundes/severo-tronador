// Webhook de Meta (WhatsApp Cloud API).
// GET  — verificación del webhook (hub.challenge) con el verify token.
// POST — actualizaciones de estado de mensajes (sent/delivered/read/failed)
//        que se escriben en el envío correspondiente por providerMessageId.
// Seguridad: GET compara verify_token con timingSafeEqual.
// POST valida x-hub-signature-256 (HMAC-SHA256 del raw body con APP_SECRET).
import { NextResponse } from "next/server";
import { updateEnvioStatus, type Envio } from "@/lib/campaigns";
import { constantTimeEqual, verifyHmacSha256 } from "@/lib/crypto";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.META_WA_VERIFY_TOKEN;

  if (mode !== "subscribe" || !token || !expected) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!constantTimeEqual(token, expected)) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response(challenge ?? "", { status: 200 });
}

const STATUS_MAP: Record<string, NonNullable<Envio["delivery"]>> = {
  delivered: "delivered",
  read: "read",
  failed: "failed",
};

interface MetaWebhookBody {
  entry?: {
    changes?: {
      value?: {
        statuses?: { id?: string; status?: string }[];
      };
    }[];
  }[];
}

export async function POST(req: Request) {
  const raw = Buffer.from(await req.arrayBuffer());
  const signature = req.headers.get("x-hub-signature-256");
  const secret = process.env.META_WA_APP_SECRET;

  if (!verifyHmacSha256(raw, signature, secret)) {
    return new Response("Forbidden", { status: 403 });
  }

  let body: MetaWebhookBody;
  try {
    body = JSON.parse(raw.toString("utf8")) as MetaWebhookBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  let updated = 0;
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const s of change.value?.statuses ?? []) {
        const mapped = s.status ? STATUS_MAP[s.status] : undefined;
        if (s.id && mapped && (await updateEnvioStatus(s.id, mapped))) updated++;
      }
    }
  }
  return NextResponse.json({ ok: true, updated });
}
