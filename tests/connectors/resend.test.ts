import { describe, it, expect, beforeEach, vi } from "vitest";

// El connector lee la config (API key + from) desde getConnectorConfig y
// contabiliza la cuota con incrementUsage. Mockeamos ambos para aislar el
// classificador de errores HTTP.
vi.mock("@/lib/connectors/config", () => ({
  getConnectorConfig: async () => ({
    RESEND_API_KEY: "re_test",
    RESEND_FROM: "from@x.ar",
  }),
}));
vi.mock("@/lib/quota", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, incrementUsage: vi.fn().mockResolvedValue(undefined) };
});

import { resendConnector } from "@/lib/connectors/resend";

const CONTACT = {
  dni: "1",
  nombre: "Ana",
  apellido: "Diaz",
  email: "ana@x.ar",
} as Parameters<typeof resendConnector.send>[1];
const MSG = { subject: "S", body: "<p>B</p>" };

function stubFetch(status: number, body: unknown = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("resendConnector.send — clasificación de errores", () => {
  it("200 → ok con providerMessageId", async () => {
    stubFetch(200, { id: "resend-123" });
    const r = await resendConnector.send(MSG, CONTACT);
    expect(r.ok).toBe(true);
    expect(r.providerMessageId).toBe("resend-123");
  });

  it("429 (rate limit) → ok=false retryable", async () => {
    stubFetch(429);
    const r = await resendConnector.send(MSG, CONTACT);
    expect(r.ok).toBe(false);
    expect(r.retryable).toBe(true);
  });

  it("503 (5xx) → ok=false retryable", async () => {
    stubFetch(503);
    const r = await resendConnector.send(MSG, CONTACT);
    expect(r.ok).toBe(false);
    expect(r.retryable).toBe(true);
  });

  it("422 (validación) → ok=false NO retryable", async () => {
    stubFetch(422);
    const r = await resendConnector.send(MSG, CONTACT);
    expect(r.ok).toBe(false);
    expect(r.retryable).toBeFalsy();
  });
});
