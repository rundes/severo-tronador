import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "node:crypto";

const SECRET = "secret-test-123";
const VERIFY = "verify-token-xyz";

function sign(body: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

beforeEach(() => {
  process.env.META_WA_APP_SECRET = SECRET;
  process.env.META_WA_VERIFY_TOKEN = VERIFY;
  vi.resetModules();
});

describe("webhook Meta — GET verify", () => {
  it("acepta verify token correcto y devuelve challenge", async () => {
    const { GET } = await import("@/app/api/webhooks/meta/route");
    const url = `http://x/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=abc123`;
    const res = await GET(new Request(url));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("abc123");
  });

  it("rechaza verify token incorrecto con 403", async () => {
    const { GET } = await import("@/app/api/webhooks/meta/route");
    const url = `http://x/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc`;
    const res = await GET(new Request(url));
    expect(res.status).toBe(403);
  });

  it("rechaza si falta el verify token con 403", async () => {
    const { GET } = await import("@/app/api/webhooks/meta/route");
    const url = `http://x/api/webhooks/meta?hub.mode=subscribe&hub.challenge=abc`;
    const res = await GET(new Request(url));
    expect(res.status).toBe(403);
  });

  it("rechaza si META_WA_VERIFY_TOKEN no está configurado", async () => {
    delete process.env.META_WA_VERIFY_TOKEN;
    const { GET } = await import("@/app/api/webhooks/meta/route");
    const url = `http://x/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=anything&hub.challenge=abc`;
    const res = await GET(new Request(url));
    expect(res.status).toBe(403);
  });

  it("rechaza mode distinto de subscribe con 403", async () => {
    const { GET } = await import("@/app/api/webhooks/meta/route");
    const url = `http://x/api/webhooks/meta?hub.mode=other&hub.verify_token=${VERIFY}&hub.challenge=abc`;
    const res = await GET(new Request(url));
    expect(res.status).toBe(403);
  });
});

describe("webhook Meta — POST HMAC", () => {
  it("rechaza POST sin header de firma con 403", async () => {
    const { POST } = await import("@/app/api/webhooks/meta/route");
    const body = JSON.stringify({ entry: [] });
    const res = await POST(new Request("http://x", { method: "POST", body }));
    expect(res.status).toBe(403);
  });

  it("rechaza POST con firma inválida (otro secret) con 403", async () => {
    const { POST } = await import("@/app/api/webhooks/meta/route");
    const body = JSON.stringify({ entry: [] });
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        headers: { "x-hub-signature-256": sign(body, "otro-secret") },
        body,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("rechaza POST con scheme no sha256 con 403", async () => {
    const { POST } = await import("@/app/api/webhooks/meta/route");
    const body = JSON.stringify({ entry: [] });
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        headers: { "x-hub-signature-256": "sha1=deadbeef" },
        body,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("acepta POST con firma válida y procesa statuses", async () => {
    vi.doMock("@/lib/campaigns", () => ({
      updateEnvioStatus: vi.fn().mockResolvedValue(true),
    }));
    const { POST } = await import("@/app/api/webhooks/meta/route");
    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  { id: "wamid.A", status: "delivered" },
                  { id: "wamid.B", status: "read" },
                ],
              },
            },
          ],
        },
      ],
    });
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        headers: { "x-hub-signature-256": sign(body, SECRET) },
        body,
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; updated: number };
    expect(json.ok).toBe(true);
    expect(json.updated).toBe(2);
  });

  it("devuelve 400 si la firma es válida pero el body no es JSON", async () => {
    const { POST } = await import("@/app/api/webhooks/meta/route");
    const body = "not-json{{{";
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        headers: { "x-hub-signature-256": sign(body, SECRET) },
        body,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rechaza POST con 403 si META_WA_APP_SECRET no está configurado", async () => {
    delete process.env.META_WA_APP_SECRET;
    const { POST } = await import("@/app/api/webhooks/meta/route");
    const body = JSON.stringify({ entry: [] });
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        headers: { "x-hub-signature-256": sign(body, "anything") },
        body,
      }),
    );
    expect(res.status).toBe(403);
  });
});
