import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("listening-cache (no db configurado)", () => {
  it("readCachedItems devuelve [] sin Supabase", async () => {
    const { readCachedItems } = await import("@/lib/listening-cache");
    expect(await readCachedItems()).toEqual([]);
  });

  it("cacheHasFreshItems devuelve false sin Supabase", async () => {
    const { cacheHasFreshItems } = await import("@/lib/listening-cache");
    expect(await cacheHasFreshItems()).toBe(false);
  });

  it("upsertItems salta cuando no hay DB", async () => {
    const { upsertItems } = await import("@/lib/listening-cache");
    const res = await upsertItems("meta-content-library", [
      { source: "meta-ig", text: "demo", url: "https://example.com/x" },
    ]);
    expect(res.inserted).toBe(0);
    expect(res.skipped).toBe(1);
  });

  it("pullAllSources ejecuta connectors aunque no haya DB y upsertea 0", async () => {
    const { pullAllSources } = await import("@/lib/listening-cache");
    const summary = await pullAllSources();
    expect(summary.bySource).toBeTruthy();
    expect(typeof summary.total).toBe("number");
    // Cada source upserted = 0 (sin DB), pero fetched > 0 si el connector
    // tiene mock data.
    for (const v of Object.values(summary.bySource)) {
      expect(v.upserted).toBe(0);
    }
  });
});

describe("cron route listening-pull · auth gate", () => {
  it("403 con auth incorrecto en prod sim", async () => {
    // En prod sin CRON_SECRET el route corta. En tests vitest defaults
    // NODE_ENV=test → cubrimos el branch del header inválido.
    process.env.CRON_SECRET = "real";
    const { GET } = await import("@/app/api/cron/listening-pull/route");
    const req = new Request("https://x/api/cron/listening-pull", {
      headers: { authorization: "Bearer fake" },
    });
    const res = await GET(req);
    expect(res.status).toBe(403);
    delete process.env.CRON_SECRET;
  });

  it("403 con auth incorrecto", async () => {
    process.env.CRON_SECRET = "correcto";
    const { GET } = await import("@/app/api/cron/listening-pull/route");
    const req = new Request("https://x/api/cron/listening-pull", {
      headers: { authorization: "Bearer incorrecto" },
    });
    const res = await GET(req);
    expect(res.status).toBe(403);
    delete process.env.CRON_SECRET;
  });

  it("200 con auth correcto + no DB → skipped", async () => {
    process.env.CRON_SECRET = "ok";
    const { GET } = await import("@/app/api/cron/listening-pull/route");
    const req = new Request("https://x/api/cron/listening-pull", {
      headers: { authorization: "Bearer ok" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { skipped?: string };
    expect(json.skipped).toBe("no db");
    delete process.env.CRON_SECRET;
  });
});
