import { describe, it, expect, beforeAll, beforeEach } from "vitest";

beforeAll(() => {
  process.env.CONFIG_MASTER_KEY = Buffer.from(new Uint8Array(32).fill(11)).toString("base64");
  delete process.env.STALWART_URL;
  delete process.env.STALWART_ADMIN_TOKEN;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

beforeEach(async () => {
  const { _clearMemoryForTests } = await import("@/lib/mailbox/credentials");
  _clearMemoryForTests();
});

describe("mailbox · jmap-client (mock mode)", () => {
  it("isLiveMode false sin STALWART_URL", async () => {
    const { isLiveMode } = await import("@/lib/mailbox/jmap-client");
    expect(isLiveMode()).toBe(false);
  });

  it("listMailboxes devuelve mock roles", async () => {
    const { listMailboxes } = await import("@/lib/mailbox/jmap-client");
    const boxes = await listMailboxes();
    expect(boxes.find((b) => b.role === "inbox")).toBeTruthy();
    expect(boxes.find((b) => b.role === "sent")).toBeTruthy();
  });

  it("listMessages('inbox') no incluye sent", async () => {
    const { listMessages } = await import("@/lib/mailbox/jmap-client");
    const items = await listMessages("inbox");
    expect(items.length).toBeGreaterThan(0);
    for (const m of items) expect(m.mailboxIds).toContain("inbox");
  });

  it("getMessage devuelve bodyText", async () => {
    const { listMessages, getMessage } = await import(
      "@/lib/mailbox/jmap-client"
    );
    const [first] = await listMessages("inbox");
    const full = await getMessage(first.id);
    expect(full).not.toBeNull();
    expect(full!.bodyText.length).toBeGreaterThan(0);
  });

  it("sendMail en mock appendea a Enviados", async () => {
    const { sendMail, listMessages } = await import(
      "@/lib/mailbox/jmap-client"
    );
    const before = (await listMessages("sent")).length;
    const res = await sendMail({
      to: [{ email: "alguien@example.com" }],
      subject: "Hola",
      bodyText: "Cuerpo",
    });
    expect(res.ok).toBe(true);
    const after = (await listMessages("sent")).length;
    expect(after).toBe(before + 1);
  });

  it("getMailboxStatus reporta mode=mock sin creds", async () => {
    const { getMailboxStatus } = await import("@/lib/mailbox/jmap-client");
    const status = await getMailboxStatus();
    expect(status.mode).toBe("mock");
    expect(status.configured).toBe(false);
    expect(status.unread).toBeGreaterThanOrEqual(0);
  });
});

describe("mailbox · credentials", () => {
  it("save → get encripta y devuelve la password en claro", async () => {
    const { saveCredential, getCredentialFor } = await import(
      "@/lib/mailbox/credentials"
    );
    await saveCredential({
      userEmail: "a@b.com",
      address: "a@tronador.net.ar",
      password: "p4ssw0rd-secret",
    });
    const cred = await getCredentialFor("a@b.com");
    expect(cred).toBeTruthy();
    expect(cred!.password).toBe("p4ssw0rd-secret");
    expect(cred!.address).toBe("a@tronador.net.ar");
  });

  it("getCredentialFor desconocido devuelve null", async () => {
    const { getCredentialFor } = await import("@/lib/mailbox/credentials");
    expect(await getCredentialFor("nope@nope.com")).toBeNull();
  });
});

describe("mailbox · provision", () => {
  it("genera local-part sanitizado", async () => {
    const { provisionMailbox } = await import("@/lib/mailbox/provision");
    const { getCredentialFor } = await import("@/lib/mailbox/credentials");
    const res = await provisionMailbox("Sanjuan.Ramiro@gmail.com");
    expect(res.ok).toBe(true);
    expect(res.address).toBe("sanjuan.ramiro@tronador.net.ar");
    expect(res.mode).toBe("mock");
    const cred = await getCredentialFor("Sanjuan.Ramiro@gmail.com");
    expect(cred?.address).toBe("sanjuan.ramiro@tronador.net.ar");
    expect(cred?.password.length).toBeGreaterThan(10);
  });

  it("limpia chars no válidos del local-part", async () => {
    const { provisionMailbox } = await import("@/lib/mailbox/provision");
    const res = await provisionMailbox("usuario+raro!@dominio.com");
    expect(res.address).toBe("usuario-raro-@tronador.net.ar");
  });
});
