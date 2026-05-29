import { describe, it, expect, beforeAll, beforeEach } from "vitest";

beforeAll(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.STALWART_URL;
  delete process.env.STALWART_ADMIN_TOKEN;
  delete process.env.MAIL_REPLIES_USER;
  delete process.env.MAIL_REPLIES_PASSWORD;
});

beforeEach(() => {
  delete process.env.MAIL_REPLIES_ENABLED;
  delete process.env.MAIL_REPLIES_DOMAIN;
  delete process.env.MAIL_REPLIES_LOCAL;
});

describe("reply-address · build + parse", () => {
  it("buildReplyTo construye replies+TOKEN@tronador.net.ar", async () => {
    const { buildReplyTo } = await import("@/lib/mailbox/reply-address");
    expect(buildReplyTo("abc123")).toBe("replies+abc123@tronador.net.ar");
  });

  it("respeta MAIL_REPLIES_DOMAIN", async () => {
    process.env.MAIL_REPLIES_DOMAIN = "mail.test.ar";
    const { buildReplyTo } = await import("@/lib/mailbox/reply-address");
    expect(buildReplyTo("xyz")).toBe("replies+xyz@mail.test.ar");
  });

  it("extractTokenFromAddress saca token de plus-addressing", async () => {
    const { extractTokenFromAddress } = await import(
      "@/lib/mailbox/reply-address"
    );
    expect(
      extractTokenFromAddress("replies+abc123@tronador.net.ar"),
    ).toBe("abc123");
    expect(
      extractTokenFromAddress(
        "Marcela Pérez <replies+token-1@tronador.net.ar>",
      ),
    ).toBe("token-1");
  });

  it("rechaza addresses sin plus", async () => {
    const { extractTokenFromAddress } = await import(
      "@/lib/mailbox/reply-address"
    );
    expect(
      extractTokenFromAddress("replies@tronador.net.ar"),
    ).toBeNull();
    expect(
      extractTokenFromAddress("alguien@tronador.net.ar"),
    ).toBeNull();
  });

  it("rechaza dominio ajeno", async () => {
    const { extractTokenFromAddress } = await import(
      "@/lib/mailbox/reply-address"
    );
    expect(
      extractTokenFromAddress("replies+foo@gmail.com"),
    ).toBeNull();
  });

  it("isRepliesConfigured depende de MAIL_REPLIES_ENABLED", async () => {
    const { isRepliesConfigured } = await import(
      "@/lib/mailbox/reply-address"
    );
    expect(isRepliesConfigured()).toBe(false);
    process.env.MAIL_REPLIES_ENABLED = "1";
    expect(isRepliesConfigured()).toBe(true);
  });
});

describe("reply-routing (sin DB)", () => {
  it("dry-run con token válido devuelve ok", async () => {
    const { routeReply } = await import("@/lib/mailbox/reply-routing");
    const result = await routeReply({
      id: "x",
      threadId: "t",
      mailboxIds: ["inbox"],
      from: { email: "vecino@example.com" },
      to: [{ email: "replies+tok-9@tronador.net.ar" }],
      subject: "Re: encuesta",
      preview: "p",
      receivedAt: new Date().toISOString(),
      isUnread: true,
      hasAttachment: false,
      bodyText: "Cuerpo de respuesta",
    });
    expect(result.ok).toBe(true);
    expect(result.envioToken).toBe("tok-9");
  });

  it("rechaza si la address no matchea el patrón", async () => {
    const { routeReply } = await import("@/lib/mailbox/reply-routing");
    const result = await routeReply({
      id: "x",
      threadId: "t",
      mailboxIds: ["inbox"],
      from: { email: "vecino@example.com" },
      to: [{ email: "admin@tronador.net.ar" }],
      subject: "?",
      preview: "p",
      receivedAt: new Date().toISOString(),
      isUnread: true,
      hasAttachment: false,
      bodyText: "x",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no_token");
  });
});

describe("mail-sync · sin live mode", () => {
  it("procesa unread del mock y los marca leídos", async () => {
    const { syncReplies } = await import("@/lib/mailbox/mail-sync");
    const summary = await syncReplies(50);
    // El mock NO usa plus-addressing en su To: la mayoría caen en no_token.
    expect(summary.mode).toBe("mock");
    expect(summary.scanned).toBeGreaterThan(0);
    expect(summary.no_token + summary.envio_not_found + summary.routed)
      .toBeGreaterThan(0);
  });
});

describe("cron mail-sync route", () => {
  it("403 con auth incorrecto", async () => {
    process.env.CRON_SECRET = "real";
    const { GET } = await import("@/app/api/cron/mail-sync/route");
    const req = new Request("https://x/api/cron/mail-sync", {
      headers: { authorization: "Bearer fake" },
    });
    const res = await GET(req);
    expect(res.status).toBe(403);
    delete process.env.CRON_SECRET;
  });

  it("200 con auth correcto + sin DB", async () => {
    process.env.CRON_SECRET = "ok";
    const { GET } = await import("@/app/api/cron/mail-sync/route");
    const req = new Request("https://x/api/cron/mail-sync", {
      headers: { authorization: "Bearer ok" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
    delete process.env.CRON_SECRET;
  });
});
