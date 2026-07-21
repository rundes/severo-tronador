import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "node:crypto";

const SECRET = "secret-test-123";
function sign(body: string) {
  return "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");
}

beforeEach(() => {
  process.env.META_WA_APP_SECRET = SECRET;
  vi.resetModules();
});

describe("webhook Meta — inbound messages", () => {
  it("parsea messages[] y llama ingestInbound", async () => {
    const ingestInbound = vi.fn().mockResolvedValue({
      stored: true, dni: "30111222", optOut: false, responseToken: "tok-1",
    });
    vi.doMock("@/lib/inbound", () => ({ ingestInbound }));
    vi.doMock("@/lib/campaigns", () => ({ updateEnvioStatus: vi.fn() }));
    const { POST } = await import("@/app/api/webhooks/meta/route");
    const body = JSON.stringify({
      entry: [{
        changes: [{
          value: {
            metadata: { phone_number_id: "PN1" },
            messages: [{ id: "wamid.1", from: "5491122223333", type: "text", text: { body: "hola" } }],
          },
        }],
      }],
    });
    const res = await POST(new Request("http://x", {
      method: "POST", headers: { "x-hub-signature-256": sign(body) }, body,
    }));
    expect(res.status).toBe(200);
    expect(ingestInbound).toHaveBeenCalledWith(expect.objectContaining({
      channel: "whatsapp", senderExternalId: "5491122223333",
      body: "hola", providerMessageId: "wamid.1",
    }));
  });

  it("ignora messages que no son type=text", async () => {
    const ingestInbound = vi.fn();
    vi.doMock("@/lib/inbound", () => ({ ingestInbound }));
    vi.doMock("@/lib/campaigns", () => ({ updateEnvioStatus: vi.fn() }));
    const { POST } = await import("@/app/api/webhooks/meta/route");
    const body = JSON.stringify({
      entry: [{ changes: [{ value: { messages: [{ id: "wamid.2", from: "549...", type: "image" }] } }] }],
    });
    const res = await POST(new Request("http://x", {
      method: "POST", headers: { "x-hub-signature-256": sign(body) }, body,
    }));
    expect(res.status).toBe(200);
    expect(ingestInbound).not.toHaveBeenCalled();
  });
});
