// Paridad de clasificación de fallos entre los conectores de envío.
//
// Antes sólo Resend distinguía un fallo transitorio de un rechazo: un 429 de
// Brevo, Meta o Telegram marcaba la fila como failed permanente y el mensaje se
// perdía. Estos tests fijan el contrato para los tres.
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/connectors/config", () => ({
  getConnectorConfig: async (id: string) =>
    ({
      brevo: { BREVO_API_KEY: "xkeysib-test", BREVO_FROM_EMAIL: "from@x.ar" },
      "meta-wa-cloud": {
        META_WA_PHONE_NUMBER_ID: "123",
        META_WA_ACCESS_TOKEN: "tok",
      },
      "telegram-bot": { TELEGRAM_BOT_TOKEN: "123:ABC" },
    })[id] ?? {},
}));
vi.mock("@/lib/quota", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, incrementUsage: vi.fn().mockResolvedValue(undefined) };
});
vi.mock("@/lib/telegram-chats", () => ({
  getChatByDni: async () => ({ chat_id: 999, opted_out_at: null }),
}));

import { brevoConnector } from "@/lib/connectors/brevo";
import { metaWaCloudConnector } from "@/lib/connectors/meta-wa-cloud";
import { telegramBotConnector } from "@/lib/connectors/telegram-bot";

const CONTACT = {
  dni: "1",
  nombre: "Ana",
  apellido: "Diaz",
  email: "ana@x.ar",
  telefono: "+5491122223333",
} as Parameters<typeof brevoConnector.send>[1];
const MSG = { subject: "S", body: "B" };

function stubFetch(
  status: number,
  body: unknown = {},
  headers: Record<string, string> = {},
) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
      json: async () => body,
    }),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

const OK_BODY: Record<string, unknown> = {
  brevo: { messageId: "b1" },
  "meta-wa-cloud": { messages: [{ id: "wamid.1" }] },
  "telegram-bot": { ok: true, result: { message_id: 7 } },
};

const CONNECTORS = [
  { id: "brevo", send: brevoConnector.send.bind(brevoConnector) },
  {
    id: "meta-wa-cloud",
    send: metaWaCloudConnector.send.bind(metaWaCloudConnector),
  },
  {
    id: "telegram-bot",
    send: telegramBotConnector.send.bind(telegramBotConnector),
  },
];

describe.each(CONNECTORS)("$id · clasificación de fallos", ({ id, send }) => {
  it("429 → retryable (no quema la fila)", async () => {
    stubFetch(429, id === "telegram-bot" ? { ok: false } : {});
    const r = await send(MSG, CONTACT);
    expect(r.ok).toBe(false);
    expect(r.retryable).toBe(true);
  });

  it("503 → retryable", async () => {
    stubFetch(503, id === "telegram-bot" ? { ok: false } : {});
    const r = await send(MSG, CONTACT);
    expect(r.retryable).toBe(true);
  });

  it("400 (validación) → NO retryable", async () => {
    stubFetch(400, id === "telegram-bot" ? { ok: false } : {});
    const r = await send(MSG, CONTACT);
    expect(r.ok).toBe(false);
    expect(r.retryable).toBeFalsy();
  });

  it("error de red → retryable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    const r = await send(MSG, CONTACT);
    expect(r.ok).toBe(false);
    expect(r.retryable).toBe(true);
  });

  it("timeout (AbortError) → retryable con mensaje explícito", async () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));
    const r = await send(MSG, CONTACT);
    expect(r.retryable).toBe(true);
    expect(r.error).toContain("timeout");
  });

  it("éxito → ok con providerMessageId", async () => {
    stubFetch(200, OK_BODY[id]);
    const r = await send(MSG, CONTACT);
    expect(r.ok).toBe(true);
    expect(r.providerMessageId).toBeTruthy();
  });
});

describe("telegram · flood control", () => {
  it("respeta parameters.retry_after en vez del backoff exponencial", async () => {
    stubFetch(429, {
      ok: false,
      description: "Too Many Requests",
      parameters: { retry_after: 42 },
    });
    const r = await telegramBotConnector.send(MSG, CONTACT);
    expect(r.retryable).toBe(true);
    expect(r.retryAfterSeconds).toBe(42);
  });
});
