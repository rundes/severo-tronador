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

let lastInit: RequestInit | undefined;

function stubFetch(
  status: number,
  body: unknown = {},
  headers: Record<string, string> = {},
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      lastInit = init;
      return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
        json: async () => body,
      };
    }),
  );
}

function sentHeader(name: string): string | undefined {
  const h = (lastInit?.headers ?? {}) as Record<string, string>;
  return h[name];
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

  it("408 (timeout del proveedor) → retryable", async () => {
    stubFetch(408);
    const r = await resendConnector.send(MSG, CONTACT);
    expect(r.retryable).toBe(true);
  });

  it("respeta el Retry-After del proveedor", async () => {
    stubFetch(429, {}, { "retry-after": "30" });
    const r = await resendConnector.send(MSG, CONTACT);
    expect(r.retryAfterSeconds).toBe(30);
  });

  it("error de red → retryable (perder el envío es peor que un duplicado)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNRESET")),
    );
    const r = await resendConnector.send(MSG, CONTACT);
    expect(r.ok).toBe(false);
    expect(r.retryable).toBe(true);
    expect(r.error).toContain("ECONNRESET");
  });

  it("manda Idempotency-Key cuando el envío trae token", async () => {
    // Es lo que hace seguro reintentar tras un timeout de red: Resend deduplica
    // por esta clave 24h, así que el reintento no manda el mail dos veces.
    stubFetch(200, { id: "r1" });
    await resendConnector.send({ ...MSG, idempotencyKey: "tk-1" }, CONTACT);
    expect(sentHeader("Idempotency-Key")).toBe("tk-1");
  });

  it("sin token no manda el header", async () => {
    stubFetch(200, { id: "r1" });
    await resendConnector.send(MSG, CONTACT);
    expect(sentHeader("Idempotency-Key")).toBeUndefined();
  });
});
