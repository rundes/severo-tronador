// Webhook de Meta (WhatsApp Cloud API).
// GET  — verificación del webhook (hub.challenge) con el verify token.
// POST — actualizaciones de estado de mensajes (sent/delivered/read/failed)
//        que se escriben en el envío correspondiente por providerMessageId.
import { NextResponse } from "next/server";
import { updateEnvioStatus, type Envio } from "@/lib/campaigns";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.META_WA_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
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
  let body: MetaWebhookBody;
  try {
    body = (await req.json()) as MetaWebhookBody;
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
