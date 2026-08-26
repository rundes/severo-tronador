import { describe, it, expect, vi } from "vitest";

const NOW = Date.UTC(2026, 7, 26, 12);
const rows = [
  { author: "ferrooficial", connector_id: "meta-ig", kind: "post", published_at: "2026-08-25T12:00:00.000Z" },
  { author: "ferrooficial", connector_id: "meta-ig", kind: "story", published_at: "2026-08-24T12:00:00.000Z" },
  { author: "@FerroOficial", connector_id: "x-api", kind: "post", published_at: "2026-08-26T09:00:00.000Z" },
  { author: "otracuenta", connector_id: "x-api", kind: "post", published_at: "2026-08-26T10:00:00.000Z" },
  { author: "ferrooficial", connector_id: "meta-ig", kind: "comment", published_at: "2026-08-26T11:00:00.000Z" },
];
vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => true,
  getSupabase: () => ({ from: () => ({ select: () => ({ eq: () => ({ in: () => ({ order: () => ({ limit: async () => ({ data: rows }) }) }) }) }) }) }),
}));
vi.mock("@/lib/extension-token", () => ({ verifyExtensionToken: async (t: string | null) => (t === "ok" ? "p1" : null) }));
vi.mock("@/lib/monitor-config", async (o) => ({
  ...(await o<typeof import("@/lib/monitor-config")>()),
  getMonitorConfig: async () => ({
    accounts: [
      { handle: "ferrooficial", platform: "instagram", category: "organizacion" },
      { handle: "@FerroOficial", platform: "x", category: "organizacion" },
      { handle: "sinhistorial", platform: "facebook", category: "medio" },
    ],
    searchesA: [], searchesB: [], entidades: {}, noRepetir: [], calendar: [], budget: {},
  }),
}));
vi.mock("@/lib/monitor-breaker", () => ({ readBreakerState: async () => ({}) }));

import { GET } from "@/app/api/extension/plan/route";
import { sinceByAccount, defaultSince } from "@/lib/extension-since";

const req = (token = "ok") =>
  new Request("https://a/api/extension/plan", { headers: { authorization: `Bearer ${token}` } });

describe("sinceByAccount", () => {
  it("usa la última pieza guardada por cuenta y 7 días atrás si no hay", async () => {
    const map = await sinceByAccount("p1", [
      { handle: "ferrooficial", platform: "instagram", category: "organizacion" },
      { handle: "@FerroOficial", platform: "x", category: "organizacion" },
      { handle: "sinhistorial", platform: "facebook", category: "medio" },
    ], NOW);
    expect(map["instagram:ferrooficial"]).toBe("2026-08-25T12:00:00.000Z");
    expect(map["x:ferrooficial"]).toBe("2026-08-26T09:00:00.000Z");
    expect(map["facebook:sinhistorial"]).toBe(defaultSince(NOW));
  });
  it("defaultSince son 7 días", () => {
    expect(defaultSince(NOW)).toBe(new Date(NOW - 7 * 86400_000).toISOString());
  });
});

describe("GET /api/extension/plan", () => {
  it("403 sin token válido", async () => {
    expect((await GET(req("bad"))).status).toBe(403);
  });
  it("cada cuenta viaja con su since", async () => {
    const body = await (await GET(req())).json();
    expect(body.accounts.map((a: { handle: string; since: string }) => [a.handle, a.since])).toEqual([
      ["ferrooficial", "2026-08-25T12:00:00.000Z"],
      ["@FerroOficial", "2026-08-26T09:00:00.000Z"],
      ["sinhistorial", expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)],
    ]);
    expect(body.budget).toBeDefined();
    expect(body.cooldowns).toEqual({});
  });
});
