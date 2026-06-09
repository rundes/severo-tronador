import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateKeyPairSync, sign as edSign } from "node:crypto";

// Par Ed25519 de prueba. La clave pública se exporta como raw base64 (32 bytes),
// igual que la que entrega el portal de Telnyx.
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const PUBLIC_B64 = publicKey
  .export({ format: "der", type: "spki" })
  .subarray(-32)
  .toString("base64");

function signTelnyx(body: string, timestamp: string): string {
  const signed = Buffer.from(`${timestamp}|${body}`);
  return edSign(null, signed, privateKey).toString("base64");
}

function nowSec(): string {
  return String(Math.floor(Date.now() / 1000));
}

beforeEach(() => {
  process.env.TELNYX_PUBLIC_KEY = PUBLIC_B64;
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function req(body: string, headers: Record<string, string> = {}): Request {
  return new Request("http://x/api/webhooks/telnyx", {
    method: "POST",
    headers,
    body,
  });
}

describe("webhook Telnyx — firma Ed25519", () => {
  it("rechaza POST sin headers de firma con 403", async () => {
    const { POST } = await import("@/app/api/webhooks/telnyx/route");
    const res = await POST(req(JSON.stringify({ data: {} })));
    expect(res.status).toBe(403);
  });

  it("rechaza firma de otra clave con 403", async () => {
    const { privateKey: otra } = generateKeyPairSync("ed25519");
    const { POST } = await import("@/app/api/webhooks/telnyx/route");
    const body = JSON.stringify({ data: {} });
    const ts = nowSec();
    const sig = edSign(null, Buffer.from(`${ts}|${body}`), otra).toString("base64");
    const res = await POST(
      req(body, { "telnyx-signature-ed25519": sig, "telnyx-timestamp": ts }),
    );
    expect(res.status).toBe(403);
  });

  it("rechaza timestamp fuera de tolerancia (replay) con 403", async () => {
    const { POST } = await import("@/app/api/webhooks/telnyx/route");
    const body = JSON.stringify({ data: {} });
    const ts = String(Math.floor(Date.now() / 1000) - 3600); // 1h atrás
    const res = await POST(
      req(body, {
        "telnyx-signature-ed25519": signTelnyx(body, ts),
        "telnyx-timestamp": ts,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("rechaza con 403 si TELNYX_PUBLIC_KEY no está configurado", async () => {
    delete process.env.TELNYX_PUBLIC_KEY;
    const { POST } = await import("@/app/api/webhooks/telnyx/route");
    const body = JSON.stringify({ data: {} });
    const ts = nowSec();
    const res = await POST(
      req(body, { "telnyx-signature-ed25519": signTelnyx(body, ts), "telnyx-timestamp": ts }),
    );
    expect(res.status).toBe(403);
  });
});

describe("webhook Telnyx — procesamiento", () => {
  it("acepta firma válida y mapea estados de entrega", async () => {
    const updateEnvioStatus = vi.fn().mockResolvedValue(true);
    vi.doMock("@/lib/campaigns", () => ({ updateEnvioStatus }));
    const { POST } = await import("@/app/api/webhooks/telnyx/route");
    const body = JSON.stringify({
      data: {
        event_type: "message.finalized",
        payload: {
          id: "msg-abc",
          to: [{ status: "delivered" }],
        },
      },
    });
    const ts = nowSec();
    const res = await POST(
      req(body, { "telnyx-signature-ed25519": signTelnyx(body, ts), "telnyx-timestamp": ts }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; updated: number };
    expect(json.ok).toBe(true);
    expect(json.updated).toBe(1);
    expect(updateEnvioStatus).toHaveBeenCalledWith("msg-abc", "delivered");
  });

  it("mapea delivery_failed → failed", async () => {
    const updateEnvioStatus = vi.fn().mockResolvedValue(true);
    vi.doMock("@/lib/campaigns", () => ({ updateEnvioStatus }));
    const { POST } = await import("@/app/api/webhooks/telnyx/route");
    const body = JSON.stringify({
      data: { payload: { id: "msg-x", to: [{ status: "delivery_failed" }] } },
    });
    const ts = nowSec();
    await POST(
      req(body, { "telnyx-signature-ed25519": signTelnyx(body, ts), "telnyx-timestamp": ts }),
    );
    expect(updateEnvioStatus).toHaveBeenCalledWith("msg-x", "failed");
  });

  it("ignora estados intermedios (sent) sin actualizar", async () => {
    const updateEnvioStatus = vi.fn().mockResolvedValue(true);
    vi.doMock("@/lib/campaigns", () => ({ updateEnvioStatus }));
    const { POST } = await import("@/app/api/webhooks/telnyx/route");
    const body = JSON.stringify({
      data: { payload: { id: "msg-y", to: [{ status: "sent" }] } },
    });
    const ts = nowSec();
    const res = await POST(
      req(body, { "telnyx-signature-ed25519": signTelnyx(body, ts), "telnyx-timestamp": ts }),
    );
    const json = (await res.json()) as { updated: number };
    expect(json.updated).toBe(0);
    expect(updateEnvioStatus).not.toHaveBeenCalled();
  });

  it("devuelve 400 si la firma es válida pero el body no es JSON", async () => {
    const { POST } = await import("@/app/api/webhooks/telnyx/route");
    const body = "no-json{{{";
    const ts = nowSec();
    const res = await POST(
      req(body, { "telnyx-signature-ed25519": signTelnyx(body, ts), "telnyx-timestamp": ts }),
    );
    expect(res.status).toBe(400);
  });
});
