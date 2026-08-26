import { describe, it, expect, vi, beforeEach } from "vitest";
const upsert = vi.fn(async () => ({ inserted: 1, skipped: 0 }));
vi.mock("@/lib/extension-token", () => ({ verifyExtensionToken: async (t: string | null) => (t === "ok" ? "p1" : null) }));
vi.mock("@/lib/listening-cache", () => ({ upsertItems: (...a: unknown[]) => upsert(...(a as [])) }));
import { POST } from "@/app/api/extension/items/route";

const req = (body: unknown, token = "ok") =>
  new Request("https://a/api/extension/items", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/extension/items", () => {
  beforeEach(() => upsert.mockClear());

  it("403 sin token válido", async () => {
    expect((await POST(req({ items: [] }, "bad"))).status).toBe(403);
  });

  it("acepta replyCount y lo guarda en meta", async () => {
    const res = await POST(req({ items: [{
      site: "x", text: "ganamos", url: "https://x.com/FerroOficial/status/222",
      author: "FerroOficial", kind: "post", publishedAt: "2026-08-25T20:00:00.000Z",
      metrics: { followers: 38200, likeCount: 23, replyCount: 7, repostCount: 6, viewCount: 1828 },
    }] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, inserted: 1 });
    const [, connectorId, items] = upsert.mock.calls[0] as unknown as [string, string, Array<Record<string, unknown>>];
    expect(connectorId).toBe("x-api");
    expect(items[0].meta).toEqual({ followers: 38200, likeCount: 23, replyCount: 7, repostCount: 6, viewCount: 1828 });
  });

  it("acepta comentarios con parentUrl", async () => {
    const res = await POST(req({ items: [{
      site: "instagram", text: "vamos ferro", url: "https://www.instagram.com/p/BBB/#c1",
      author: "hincha1", kind: "comment", parentUrl: "https://www.instagram.com/p/BBB/",
      publishedAt: "2026-08-25T13:00:00.000Z", metrics: { likeCount: 4 },
    }] }));
    expect(res.status).toBe(200);
    const items = (upsert.mock.calls[0] as unknown as [string, string, Array<Record<string, unknown>>])[2];
    expect(items[0].kind).toBe("comment");
    expect(items[0].parentUrl).toBe("https://www.instagram.com/p/BBB/");
  });

  it("400 si replyCount es negativo", async () => {
    const res = await POST(req({ items: [{
      site: "x", text: "t", url: "https://x.com/a/status/1", metrics: { replyCount: -1 },
    }] }));
    expect(res.status).toBe(400);
  });
});
