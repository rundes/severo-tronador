import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

beforeAll(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.STALWART_URL;
  delete process.env.STALWART_ADMIN_TOKEN;
});

beforeEach(() => {
  delete process.env.MAIL_INBOUND_SECRET;
});

const SAMPLE_MIME = [
  "From: Vecino Test <vecino@example.com>",
  "To: replies+tok-xyz@tronador.net.ar",
  "Subject: Re: Encuesta barrio",
  "Date: Mon, 26 May 2026 14:00:00 +0000",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Hola,",
  "",
  "Respondo la encuesta: me preocupa la inseguridad y el alumbrado.",
  "",
  "Saludos,",
  "Vecino",
  "",
].join("\r\n");

function sign(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("inbound-parser · postal-mime", () => {
  it("parsea From / To / Subject / body", async () => {
    const { parseRawEmail } = await import("@/lib/mailbox/inbound-parser");
    const email = await parseRawEmail(SAMPLE_MIME);
    expect(email.from.email).toBe("vecino@example.com");
    expect(email.from.name).toBe("Vecino Test");
    expect(email.to[0]?.email).toBe("replies+tok-xyz@tronador.net.ar");
    expect(email.subject).toBe("Re: Encuesta barrio");
    expect(email.bodyText).toMatch(/inseguridad y el alumbrado/);
    expect(email.isUnread).toBe(true);
  });
});

describe("webhook /api/webhooks/mail-in", () => {
  it("503 sin MAIL_INBOUND_SECRET", async () => {
    const { POST } = await import("@/app/api/webhooks/mail-in/route");
    const req = new Request("https://x/api/webhooks/mail-in", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
  });

  it("403 sin firma válida", async () => {
    process.env.MAIL_INBOUND_SECRET = "secreto-bueno";
    const { POST } = await import("@/app/api/webhooks/mail-in/route");
    const body = JSON.stringify({ raw: SAMPLE_MIME });
    const req = new Request("https://x/api/webhooks/mail-in", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tronador-signature": sign("OTRO-SECRET", body),
      },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("403 sin header de firma", async () => {
    process.env.MAIL_INBOUND_SECRET = "secreto";
    const { POST } = await import("@/app/api/webhooks/mail-in/route");
    const body = JSON.stringify({ raw: SAMPLE_MIME });
    const req = new Request("https://x/api/webhooks/mail-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("200 con firma OK + raw válido, devuelve routing result (no_token? no_envio?)", async () => {
    process.env.MAIL_INBOUND_SECRET = "shared";
    const { POST } = await import("@/app/api/webhooks/mail-in/route");
    const body = JSON.stringify({ raw: SAMPLE_MIME });
    const req = new Request("https://x/api/webhooks/mail-in", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tronador-signature": sign("shared", body),
      },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; reason: string | null };
    // Sin DB configurada, routeReply hace dry-run y devuelve ok=true.
    expect(json.ok).toBe(true);
  });

  it("400 si raw está ausente", async () => {
    process.env.MAIL_INBOUND_SECRET = "x";
    const { POST } = await import("@/app/api/webhooks/mail-in/route");
    const body = JSON.stringify({ from: "a@b.com" });
    const req = new Request("https://x/api/webhooks/mail-in", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tronador-signature": sign("x", body),
      },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
