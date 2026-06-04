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

const RELATED_MIME = [
  "From: A <a@example.com>",
  "To: b@tronador.net.ar",
  "Subject: Con imagen inline",
  'Content-Type: multipart/related; boundary="BOUND"',
  "",
  "--BOUND",
  "Content-Type: text/html; charset=utf-8",
  "",
  '<p>Hola <img src="cid:img1"></p>',
  "--BOUND",
  "Content-Type: image/gif",
  "Content-Transfer-Encoding: base64",
  "Content-ID: <img1>",
  "",
  "R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=",
  "--BOUND--",
  "",
].join("\r\n");

describe("inbound-parser · imágenes inline (cid)", () => {
  it("reemplaza cid: por data: URI en el HTML", async () => {
    const { parseRawEmail } = await import("@/lib/mailbox/inbound-parser");
    const email = await parseRawEmail(RELATED_MIME);
    expect(email.bodyHtml).toBeDefined();
    expect(email.bodyHtml).toContain("data:image/gif;base64,");
    expect(email.bodyHtml).not.toContain("cid:img1");
    expect(email.hasAttachment).toBe(true);
  });
});

const SVG_RELATED_MIME = [
  "From: A <a@example.com>",
  "To: b@tronador.net.ar",
  "Subject: SVG inline",
  'Content-Type: multipart/related; boundary="B"',
  "",
  "--B",
  "Content-Type: text/html; charset=utf-8",
  "",
  '<p><img src="cid:s1"></p>',
  "--B",
  "Content-Type: image/svg+xml",
  "Content-Transfer-Encoding: base64",
  "Content-ID: <s1>",
  "",
  "PHN2Zz48L3N2Zz4=",
  "--B--",
  "",
].join("\r\n");

describe("inbound-parser · seguridad", () => {
  it("no inlina mimeType fuera del allowlist (svg+xml queda como cid)", async () => {
    const { parseRawEmail } = await import("@/lib/mailbox/inbound-parser");
    const email = await parseRawEmail(SVG_RELATED_MIME);
    expect(email.bodyHtml).toContain("cid:s1");
    expect(email.bodyHtml).not.toContain("data:image/svg");
  });
});

describe("sanitizeEmailHtml", () => {
  it("quita script, handlers on* y javascript:", async () => {
    const { sanitizeEmailHtml } = await import("@/lib/mailbox/sanitize");
    const dirty =
      '<p>hola</p><script>alert(1)</script>' +
      '<img src="x" onerror="alert(1)">' +
      '<a href="javascript:alert(1)">click</a>';
    const clean = sanitizeEmailHtml(dirty);
    expect(clean).toContain("hola");
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("onerror");
    expect(clean).not.toContain("javascript:");
  });

  it("preserva imágenes data: y http", async () => {
    const { sanitizeEmailHtml } = await import("@/lib/mailbox/sanitize");
    const clean = sanitizeEmailHtml(
      '<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="><img src="https://x/y.png">',
    );
    expect(clean).toContain("data:image/gif;base64,");
    expect(clean).toContain("https://x/y.png");
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
