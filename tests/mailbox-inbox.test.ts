import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import {
  storeInbound,
  storeOutbound,
  listInbound,
  getInbound,
  markInboundRead,
  inboxUnreadCount,
  outboundCount,
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

describe("outbound / carpeta Enviados", () => {
  it("storeOutbound separa de la bandeja de entrada y cuenta aparte", async () => {
    await storeInbound({ projectId: P, messageId: "in1", fromEmail: "x@y.com", bodyText: "entrante" });
    await storeOutbound({
      projectId: P,
      messageId: "out1",
      fromEmail: "yo@tronador.net.ar",
      toEmail: "dest@gmail.com",
      subject: "Enviado",
      bodyText: "hola dest",
    });

    const inbox = await listInbound(P, "in");
    const sent = await listInbound(P, "out");
    expect(inbox).toHaveLength(1);
    expect(inbox[0].from.email).toBe("x@y.com");
    expect(sent).toHaveLength(1);
    expect(sent[0].to[0]?.email).toBe("dest@gmail.com");
    expect(sent[0].isUnread).toBe(false); // saliente nace leído
    expect(await outboundCount(P)).toBe(1);
    // El saliente no infla el contador de no-leídos de la bandeja.
    expect(await inboxUnreadCount(P)).toBe(1);
  });
});

describe("editar dirección de casilla", () => {
  beforeAll(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.CONFIG_MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  beforeEach(async () => {
    const { _clearMemoryForTests } = await import("@/lib/mailbox/credentials");
    _clearMemoryForTests();
  });

  it("updateAddress cambia el address preservando la password", async () => {
    const { saveCredential, updateAddress, getCredentialFor } = await import(
      "@/lib/mailbox/credentials"
    );
    await saveCredential({
      userEmail: "user@gmail.com",
      address: "user@tronador.net.ar",
      password: "secreta123",
    });
    await updateAddress("user@gmail.com", "prensa@tronador.net.ar");
    const cred = await getCredentialFor("user@gmail.com");
    expect(cred?.address).toBe("prensa@tronador.net.ar");
    expect(cred?.password).toBe("secreta123");
  });

  it("isAddressTakenByOther detecta colisión con otro usuario (case-insensitive)", async () => {
    const { saveCredential, isAddressTakenByOther } = await import(
      "@/lib/mailbox/credentials"
    );
    await saveCredential({
      userEmail: "ana@gmail.com",
      address: "prensa@tronador.net.ar",
      password: "x",
    });
    // Otro usuario intenta la misma dirección.
    expect(await isAddressTakenByOther("PRENSA@tronador.net.ar", "beto@gmail.com")).toBe(true);
    // El mismo dueño no cuenta como colisión.
    expect(await isAddressTakenByOther("prensa@tronador.net.ar", "ana@gmail.com")).toBe(false);
    // Dirección libre.
    expect(await isAddressTakenByOther("libre@tronador.net.ar", "beto@gmail.com")).toBe(false);
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
