import { describe, it, expect, vi } from "vitest";

const NOW = Date.UTC(2026, 7, 26, 12);
const rows = [
  { author: "ferrooficial", connector_id: "meta-ig", kind: "post", published_at: "2026-08-25T12:00:00.000Z" },
  // Historia MÁS NUEVA que el último post: no mueve el since (expira, no es feed).
  { author: "ferrooficial", connector_id: "meta-ig", kind: "story", published_at: "2026-08-26T08:00:00.000Z" },
  { author: "ferrooficial", connector_id: "meta-ig", kind: "story", published_at: "2026-08-24T12:00:00.000Z" },
  // published_at NULL: no cuenta.
  { author: "ferrooficial", connector_id: "meta-ig", kind: "post", published_at: null },
  // Conector no social: no cuenta.
  { author: "ferrooficial", connector_id: "rss", kind: "post", published_at: "2026-08-26T11:30:00.000Z" },
  { author: "@FerroOficial", connector_id: "x-api", kind: "post", published_at: "2026-08-26T09:00:00.000Z" },
  { author: "otracuenta", connector_id: "x-api", kind: "post", published_at: "2026-08-26T10:00:00.000Z" },
  { author: "ferrooficial", connector_id: "meta-ig", kind: "comment", published_at: "2026-08-26T11:00:00.000Z" },
];
type R = (typeof rows)[number];
// Mock que aplica los filtros .in()/.not() como lo haría Postgres, así el
// test verifica que la consulta excluye historias, NULL y conectores ajenos.
function builder(pred: (r: R) => boolean = () => true) {
  const b = {
    select: () => b,
    eq: () => b,
    in: (col: keyof R, vals: string[]) => builder((r) => pred(r) && vals.includes(String(r[col]))),
    not: (col: keyof R, op: string, val: null) =>
      builder((r) => pred(r) && !(op === "is" && val === null && r[col] === null)),
    order: () => b,
    // Desc por published_at, NULL al final, como Postgres.
    limit: async () => ({
      data: rows.filter(pred).sort((a, c) => (c.published_at ?? "").localeCompare(a.published_at ?? "")),
    }),
  };
  return b;
}
vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => true,
  getSupabase: () => ({ from: () => builder() }),
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
  it("una historia más nueva que el último post no mueve el since; NULL y no sociales se ignoran", async () => {
    const map = await sinceByAccount("p1", [
      { handle: "ferrooficial", platform: "instagram", category: "organizacion" },
    ], NOW);
    expect(map["instagram:ferrooficial"]).toBe("2026-08-25T12:00:00.000Z");
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
