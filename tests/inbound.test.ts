import { describe, it, expect, beforeEach, vi } from "vitest";

beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const g = globalThis as unknown as { __memRepos?: Map<string, unknown> };
  g.__memRepos?.delete?.("inbound_messages");
  vi.resetModules();
});

function mockDeps(opts: {
  contacts?: { dni: string; telefono: string }[];
  token?: { token: string; campaignId: string } | null;
  addResponseImpl?: (...a: unknown[]) => unknown;
}) {
  vi.doMock("@/lib/db/padron", () => ({
    readPadronFromDb: vi.fn(async () => opts.contacts ?? []),
  }));
  vi.doMock("@/lib/campaigns", () => ({
    latestSurveyTokenForDni: vi.fn(async () => opts.token ?? null),
  }));
  const addResponse = vi.fn(opts.addResponseImpl ?? (async () => ({ id: "r1" })));
  vi.doMock("@/lib/survey", () => ({ addResponse }));
  const optOut = vi.fn(async () => ({ dni: "x" }));
  vi.doMock("@/lib/optout", () => ({ optOut }));
  return { addResponse, optOut };
}

describe("ingestInbound", () => {
  it("WhatsApp: matchea contacto por teléfono y guarda respuesta", async () => {
    const { addResponse } = mockDeps({
      contacts: [{ dni: "30111222", telefono: "+54 911 2222-3333" }],
      token: { token: "tok-1", campaignId: "camp-1" },
    });
    const { ingestInbound } = await import("@/lib/inbound");
    const res = await ingestInbound({
      channel: "whatsapp",
      senderExternalId: "5491122223333",
      body: "me preocupa la inseguridad",
      providerMessageId: "wamid.1",
    });
    expect(res).toMatchObject({ stored: true, dni: "30111222", optOut: false, responseToken: "tok-1" });
    expect(addResponse).toHaveBeenCalledWith("tok-1", [
      { pregunta: "(vía whatsapp)", respuesta: "me preocupa la inseguridad" },
    ]);
  });

  it("opt-out por keyword: marca baja y NO guarda respuesta", async () => {
    const { addResponse, optOut } = mockDeps({
      contacts: [{ dni: "30111222", telefono: "5491122223333" }],
      token: { token: "tok-1", campaignId: "camp-1" },
    });
    const { ingestInbound } = await import("@/lib/inbound");
    const res = await ingestInbound({
      channel: "sms", senderExternalId: "5491122223333", body: "BAJA",
      providerMessageId: "tx-1",
    });
    expect(res.optOut).toBe(true);
    expect(res.responseToken).toBeNull();
    expect(optOut).toHaveBeenCalled();
    expect(addResponse).not.toHaveBeenCalled();
  });

  it("remitente desconocido: guarda crudo con dni null, sin respuesta", async () => {
    const { addResponse } = mockDeps({ contacts: [], token: null });
    const { ingestInbound } = await import("@/lib/inbound");
    const res = await ingestInbound({
      channel: "whatsapp", senderExternalId: "5490000000000", body: "hola",
      providerMessageId: "wamid.2",
    });
    expect(res).toMatchObject({ stored: true, dni: null, responseToken: null });
    expect(addResponse).not.toHaveBeenCalled();
  });

  it("sin encuesta activa en ventana: guarda crudo sin respuesta", async () => {
    const { addResponse } = mockDeps({
      contacts: [{ dni: "30111222", telefono: "5491122223333" }],
      token: null,
    });
    const { ingestInbound } = await import("@/lib/inbound");
    const res = await ingestInbound({
      channel: "whatsapp", senderExternalId: "5491122223333", body: "hola",
      providerMessageId: "wamid.3",
    });
    expect(res.dni).toBe("30111222");
    expect(res.responseToken).toBeNull();
    expect(addResponse).not.toHaveBeenCalled();
  });

  it("Telegram: usa dni/projectId provistos, no resuelve por teléfono", async () => {
    const { addResponse } = mockDeps({
      contacts: [], token: { token: "tok-9", campaignId: "camp-9" },
    });
    const { ingestInbound } = await import("@/lib/inbound");
    const res = await ingestInbound({
      channel: "telegram", senderExternalId: "987654", body: "ok",
      providerMessageId: "tg-1", dni: "40555666", projectId: "proj-2",
    });
    expect(res.dni).toBe("40555666");
    expect(addResponse).toHaveBeenCalledWith("tok-9", [
      { pregunta: "(vía telegram)", respuesta: "ok" },
    ]);
  });

  it("idempotencia: mismo provider_message_id no duplica ni reprocesa", async () => {
    const { addResponse } = mockDeps({
      contacts: [{ dni: "30111222", telefono: "5491122223333" }],
      token: { token: "tok-1", campaignId: "camp-1" },
    });
    const { ingestInbound } = await import("@/lib/inbound");
    const input = {
      channel: "whatsapp" as const, senderExternalId: "5491122223333",
      body: "hola", providerMessageId: "wamid.dup",
    };
    const first = await ingestInbound(input);
    expect(first.stored).toBe(true);
    const second = await ingestInbound(input);
    expect(second.stored).toBe(false);
    expect(addResponse).toHaveBeenCalledTimes(1);
  });
});
