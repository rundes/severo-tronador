import { describe, it, expect, beforeEach, vi } from "vitest";

// La firma Ed25519 se mockea: verificamos el ruteo, no la cripto (ya cubierta).
beforeEach(() => {
  process.env.TELNYX_PUBLIC_KEY = "k";
  vi.resetModules();
});

describe("webhook Telnyx — inbound SMS", () => {
  it("rama message.received llama ingestInbound", async () => {
    const ingestInbound = vi.fn().mockResolvedValue({
      stored: true, dni: "30111222", optOut: false, responseToken: null,
    });
    vi.doMock("@/lib/inbound", () => ({ ingestInbound }));
    vi.doMock("@/lib/campaigns", () => ({ updateEnvioStatus: vi.fn() }));
    vi.doMock("@/lib/crypto", () => ({ verifyTelnyxSignature: () => true }));
    const { POST } = await import("@/app/api/webhooks/telnyx/route");
    const body = JSON.stringify({
      data: {
        event_type: "message.received",
        payload: {
          id: "tx-1",
          from: { phone_number: "+5491122223333" },
          to: [{ phone_number: "+5491100000000" }],
          text: "me preocupa el transporte",
        },
      },
    });
    const res = await POST(new Request("http://x", {
      method: "POST",
      headers: { "telnyx-signature-ed25519": "s", "telnyx-timestamp": "1" },
      body,
    }));
    expect(res.status).toBe(200);
    expect(ingestInbound).toHaveBeenCalledWith(expect.objectContaining({
      channel: "sms", senderExternalId: "+5491122223333",
      body: "me preocupa el transporte", providerMessageId: "tx-1",
    }));
  });
});
