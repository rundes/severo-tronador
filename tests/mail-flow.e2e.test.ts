// E2E del flujo de mail Cloudflare+Resend (sin DB → memoria):
//   1. Entrante: POST firmado al webhook mail-in → se guarda en la bandeja.
//   2. Tracking: pixel de apertura responde GIF; redirect de click valida host.
// Verifica el cableado completo de las rutas reales (no mocks de las rutas).
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

beforeAll(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.MAIL_INBOUND_SECRET = "test-secret";
  process.env.NEXTAUTH_URL = "https://app.tronador";
});

beforeEach(() => {
  const g = globalThis as unknown as {
    __inboundEmails?: unknown[];
    __emailEvents?: unknown[];
  };
  if (g.__inboundEmails) g.__inboundEmails.length = 0;
  if (g.__emailEvents) g.__emailEvents.length = 0;
});

function sign(body: string): string {
  return "sha256=" + createHmac("sha256", "test-secret").update(body).digest("hex");
}

describe("mail E2E — entrante → bandeja", () => {
  it("webhook firmado guarda el mail en la bandeja in-app", async () => {
    const raw = [
      "From: Vecina <vecina@gmail.com>",
      "To: admin@tronador.net.ar",
      "Subject: Consulta sobre el relevamiento",
      "Message-ID: <e2e-1@gmail.com>",
      "",
      "Hola, quería preguntar por el relevamiento del barrio.",
    ].join("\r\n");
    const body = JSON.stringify({ raw, to: "admin@tronador.net.ar", from: "vecina@gmail.com" });

    const { POST } = await import("@/app/api/webhooks/mail-in/route");
    const res = await POST(
      new Request("https://app.tronador/api/webhooks/mail-in", {
        method: "POST",
        body,
        headers: { "x-tronador-signature": sign(body) },
      }),
    );
    expect(res.status).toBe(200);

    const { listInbound } = await import("@/lib/mailbox/inbox-store");
    const { DEFAULT_PROJECT_ID } = await import("@/lib/projects");
    const inbox = await listInbound(DEFAULT_PROJECT_ID);
    expect(inbox.length).toBe(1);
    expect(inbox[0].from.email).toBe("vecina@gmail.com");
    expect(inbox[0].subject).toContain("relevamiento");
  });

  it("webhook con firma inválida → 403, no guarda nada", async () => {
    const body = JSON.stringify({ raw: "From: x@y\r\n\r\nz", to: "a@tronador.net.ar" });
    const { POST } = await import("@/app/api/webhooks/mail-in/route");
    const res = await POST(
      new Request("https://app.tronador/api/webhooks/mail-in", {
        method: "POST",
        body,
        headers: { "x-tronador-signature": "sha256=deadbeef" },
      }),
    );
    expect(res.status).toBe(403);
    const { listInbound } = await import("@/lib/mailbox/inbox-store");
    const { DEFAULT_PROJECT_ID } = await import("@/lib/projects");
    expect(await listInbound(DEFAULT_PROJECT_ID)).toHaveLength(0);
  });
});

describe("mail E2E — tracking", () => {
  it("pixel de apertura responde GIF", async () => {
    const { GET } = await import("@/app/api/track/o/[token]/route");
    const res = await GET(
      new Request("https://app.tronador/api/track/o/tok-e2e"),
      { params: Promise.resolve({ token: "tok-e2e" }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/gif");
  });

  it("redirect de click same-host → 302; host foráneo → 400", async () => {
    const enc = (s: string) =>
      Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const { GET } = await import("@/app/api/track/c/[token]/route");
    const ok = await GET(
      new Request(`https://app.tronador/api/track/c/t?u=${enc("https://app.tronador/encuesta/t")}`),
      { params: Promise.resolve({ token: "t" }) },
    );
    expect(ok.status).toBe(302);
    const bad = await GET(
      new Request(`https://app.tronador/api/track/c/t?u=${enc("https://evil.example")}`),
      { params: Promise.resolve({ token: "t" }) },
    );
    expect(bad.status).toBe(400);
  });
});
