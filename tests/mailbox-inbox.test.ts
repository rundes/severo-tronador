import { describe, it, expect, beforeEach } from "vitest";
import {
  storeInbound,
  listInbound,
  getInbound,
  markInboundRead,
  inboxUnreadCount,
} from "@/lib/mailbox/inbox-store";

const P = "proj-inbox";

beforeEach(() => {
  const g = globalThis as unknown as { __inboundEmails?: unknown[] };
  if (g.__inboundEmails) g.__inboundEmails.length = 0;
});

describe("inbox-store (memory, modo Cloudflare+Resend)", () => {
  it("guarda, lista, abre y marca leído por proyecto", async () => {
    await storeInbound({
      projectId: P,
      messageId: "m1",
      fromEmail: "vecina@gmail.com",
      fromName: "Vecina",
      toEmail: "admin@tronador.net.ar",
      subject: "Consulta",
      bodyText: "Hola, una consulta sobre el relevamiento.",
    });
    const list = await listInbound(P);
    expect(list).toHaveLength(1);
    expect(list[0].from.email).toBe("vecina@gmail.com");
    expect(list[0].isUnread).toBe(true);
    expect(list[0].preview).toContain("consulta");
    expect(await inboxUnreadCount(P)).toBe(1);

    const full = await getInbound(P, list[0].id);
    expect(full?.bodyText).toContain("relevamiento");

    await markInboundRead(P, list[0].id);
    expect(await inboxUnreadCount(P)).toBe(0);
  });

  it("aislamiento: otro proyecto no ve el entrante", async () => {
    await storeInbound({
      projectId: P,
      messageId: "m2",
      fromEmail: "x@y.com",
      bodyText: "hola",
    });
    expect(await listInbound("otro-proj")).toHaveLength(0);
    expect(await inboxUnreadCount("otro-proj")).toBe(0);
  });
});

describe("mailMode", () => {
  it("mock sin nada; resend con RESEND_API_KEY", async () => {
    delete process.env.STALWART_URL;
    delete process.env.STALWART_ADMIN_TOKEN;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.RESEND_API_KEY;
    const { mailMode } = await import("@/lib/mailbox/jmap-client");
    expect(mailMode()).toBe("mock");
    process.env.RESEND_API_KEY = "re_test";
    expect(mailMode()).toBe("resend");
    delete process.env.RESEND_API_KEY;
  });
});
