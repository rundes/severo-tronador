import { describe, it, expect, beforeEach, vi } from "vitest";

const SECRET = "tg-secret";
beforeEach(() => {
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const g = globalThis as unknown as { __telegramChats?: Map<string, unknown> };
  g.__telegramChats = new Map([
    ["proj-1:40555666", { dni: "40555666", chat_id: 987654, project_id: "proj-1" }],
  ]);
  vi.resetModules();
});

describe("webhook Telegram — texto libre", () => {
  it("rutea free-text a ingestInbound con dni del chat", async () => {
    const ingestInbound = vi.fn().mockResolvedValue({
      stored: true, dni: "40555666", optOut: false, responseToken: "tok-1",
    });
    vi.doMock("@/lib/inbound", () => ({ ingestInbound }));
    const { POST } = await import("@/app/api/webhooks/telegram/route");
    const update = {
      message: { message_id: 55, chat: { id: 987654 }, from: { id: 987654 }, text: "me preocupa la salud" },
    };
    const res = await POST(new Request("http://x", {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": SECRET, "content-type": "application/json" },
      body: JSON.stringify(update),
    }));
    expect(res.status).toBe(200);
    expect(ingestInbound).toHaveBeenCalledWith(expect.objectContaining({
      channel: "telegram", senderExternalId: "987654",
      body: "me preocupa la salud", providerMessageId: "55",
      dni: "40555666", projectId: "proj-1",
    }));
  });
});
