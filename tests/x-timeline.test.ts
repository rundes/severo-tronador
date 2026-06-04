import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";

beforeAll(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("x-timeline: fetchXRecentByHandle (stub global fetch)", () => {
  it("arma ListenItems kind=tweet, recorta a POSTS_PER_USER y reporta raw", async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: String(i),
      text: `post ${i}`,
      created_at: "2026-06-01T10:00:00Z",
    }));
    vi.stubGlobal("fetch", () =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: many,
            includes: { users: [{ id: "1", username: "MarcosK" }] },
          }),
      } as Response),
    );
    const { fetchXRecentByHandle, POSTS_PER_USER } = await import(
      "@/lib/connectors/x-api"
    );
    const { items, raw } = await fetchXRecentByHandle("marcosk", "tok");
    expect(raw).toBe(8); // lo que devolvió la API (para cuota)
    expect(items).toHaveLength(POSTS_PER_USER); // recorte a 5
    expect(items[0]).toMatchObject({
      source: "x.com",
      url: "https://x.com/MarcosK/status/0", // usa username de includes
      author: "MarcosK",
      kind: "tweet",
      publishedAt: "2026-06-01T10:00:00Z",
    });
  });

  it("cae al handle si includes no trae username", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: "9", text: "hola" }] }),
      } as Response),
    );
    const { fetchXRecentByHandle } = await import("@/lib/connectors/x-api");
    const { items, raw } = await fetchXRecentByHandle("vecinocentro", "tok");
    expect(raw).toBe(1);
    expect(items[0].url).toBe("https://x.com/vecinocentro/status/9");
    expect(items[0].author).toBe("vecinocentro");
  });

  it("sin posteos devuelve vacío y raw=0", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response),
    );
    const { fetchXRecentByHandle } = await import("@/lib/connectors/x-api");
    const { items, raw } = await fetchXRecentByHandle("nadie", "tok");
    expect(items).toEqual([]);
    expect(raw).toBe(0);
  });

  it("tira en HTTP no-ok (p.ej. 402 sin plan)", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve({ ok: false, status: 402 } as Response),
    );
    const { fetchXRecentByHandle } = await import("@/lib/connectors/x-api");
    await expect(fetchXRecentByHandle("x", "tok")).rejects.toThrow(/HTTP 402/);
  });
});

describe("x-timeline: cola sin Supabase", () => {
  it("enqueueXHandles devuelve 0 sin DB", async () => {
    const { enqueueXHandles } = await import("@/lib/x-timeline");
    expect(await enqueueXHandles("p1", ["@vecino", "x.com/marcos"])).toBe(0);
  });

  it("processXHandleQueue se salta sin DB", async () => {
    const { processXHandleQueue } = await import("@/lib/x-timeline");
    const res = await processXHandleQueue("p1");
    expect(res.skipped).toBe("no db");
    expect(res.processed).toBe(0);
  });
});

describe("cron route x-timeline · auth gate", () => {
  it("403 con auth incorrecto", async () => {
    process.env.CRON_SECRET = "real";
    const { GET } = await import("@/app/api/cron/x-timeline/route");
    const req = new Request("https://x/api/cron/x-timeline", {
      headers: { authorization: "Bearer fake" },
    });
    const res = await GET(req);
    expect(res.status).toBe(403);
    delete process.env.CRON_SECRET;
  });

  it("skipped sin DB con auth correcto", async () => {
    process.env.CRON_SECRET = "real";
    const { GET } = await import("@/app/api/cron/x-timeline/route");
    const req = new Request("https://x/api/cron/x-timeline", {
      headers: { authorization: "Bearer real" },
    });
    const res = await GET(req);
    const json = (await res.json()) as { skipped?: string };
    expect(json.skipped).toBe("no db");
    delete process.env.CRON_SECRET;
  });
});
