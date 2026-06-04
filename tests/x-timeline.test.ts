import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";

beforeAll(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("x-timeline: mapeo de tweets", () => {
  it("mapTimelineTweets arma ListenItem kind=tweet con url y author", async () => {
    const { mapTimelineTweets } = await import("@/lib/connectors/x-api");
    const items = mapTimelineTweets(
      [
        { id: "111", text: "hola barrio", created_at: "2026-06-01T10:00:00Z" },
        { id: "222", text: "obras en la plaza" },
      ],
      "vecinacentro",
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      source: "x.com",
      text: "hola barrio",
      url: "https://x.com/vecinacentro/status/111",
      author: "vecinacentro",
      kind: "tweet",
      publishedAt: "2026-06-01T10:00:00Z",
    });
    expect(items[1].url).toBe("https://x.com/vecinacentro/status/222");
  });
});

describe("x-timeline: helpers de fetch (stub global fetch)", () => {
  it("resolveXUserId devuelve id + username", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ data: { id: "999", username: "MarcosK" } }),
      } as Response),
    );
    const { resolveXUserId } = await import("@/lib/connectors/x-api");
    const ref = await resolveXUserId("marcosk", "tok");
    expect(ref).toEqual({ id: "999", username: "MarcosK" });
  });

  it("resolveXUserId tira si el usuario no existe", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response),
    );
    const { resolveXUserId } = await import("@/lib/connectors/x-api");
    await expect(resolveXUserId("noexiste", "tok")).rejects.toThrow(
      /no encontrado/,
    );
  });

  it("fetchXUserTimeline trae a lo sumo POSTS_PER_USER posteos", async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: String(i),
      text: `post ${i}`,
    }));
    vi.stubGlobal("fetch", () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: many }),
      } as Response),
    );
    const { fetchXUserTimeline, POSTS_PER_USER } = await import(
      "@/lib/connectors/x-api"
    );
    const items = await fetchXUserTimeline("999", "marcosk", "tok");
    expect(items).toHaveLength(POSTS_PER_USER);
    expect(items.every((i) => i.kind === "tweet")).toBe(true);
  });

  it("fetchXUserTimeline tira en HTTP no-ok", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve({ ok: false, status: 429 } as Response),
    );
    const { fetchXUserTimeline } = await import("@/lib/connectors/x-api");
    await expect(fetchXUserTimeline("999", "x", "tok")).rejects.toThrow(
      /HTTP 429/,
    );
  });
});

describe("x-timeline: cola sin Supabase", () => {
  it("enqueueXHandles devuelve 0 sin DB", async () => {
    const { enqueueXHandles } = await import("@/lib/x-timeline");
    expect(await enqueueXHandles(["@vecino", "x.com/marcos"])).toBe(0);
  });

  it("processXHandleQueue se salta sin DB", async () => {
    const { processXHandleQueue } = await import("@/lib/x-timeline");
    const res = await processXHandleQueue();
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
