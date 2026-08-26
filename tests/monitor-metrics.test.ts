import { describe, it, expect, vi } from "vitest";
const NOW = Date.UTC(2026, 7, 25, 12);
let rows: Array<Record<string, unknown>> = [
  { author: "somosferro2026", source: "instagram/extension", kind: "story", published_at: "2026-08-25T10:00:00.000Z", created_at: "2026-08-25T10:00:00.000Z", text: "s1", meta: { expiringAt: new Date(NOW + 3600_000).toISOString() } },
  { author: "somosferro2026", source: "instagram/extension", kind: "story", published_at: "2026-08-24T10:00:00.000Z", created_at: "2026-08-24T10:00:00.000Z", text: "s0", meta: { expiringAt: new Date(NOW - 3600_000).toISOString() } },
  { author: "somosferro2026", source: "instagram/extension", kind: "post", published_at: "2026-08-25T09:00:00.000Z", created_at: "2026-08-25T09:00:00.000Z", text: "carrusel", meta: { followers: 1000, likeCount: 306 } },
];
vi.mock("@/lib/db/supabase", () => ({ dbConfigured: () => true, getSupabase: () => ({ from: () => ({ select: () => ({ eq: () => ({ gte: () => ({ limit: async () => ({ data: rows }) }) }) }) }) }) }));
vi.mock("@/lib/monitor-config", async (o) => ({ ...(await o<typeof import("@/lib/monitor-config")>()), getMonitorConfig: async () => ({ accounts: [{ handle: "somosferro2026", platform: "instagram", category: "organizacion" }], searchesA: [], searchesB: [], entidades: {}, noRepetir: [], calendar: [], budget: {} }) }));
import { accountMetrics } from "@/lib/monitor-metrics";

describe("accountMetrics", () => {
  it("historias vivas cuenta solo las no vencidas; ultimaPieza es el post más reciente", async () => {
    const [m] = await accountMetrics("p1", 7, NOW);
    expect(m.historiasVivas).toBe(1);
    expect(m.ultimaPieza).toEqual({ url: undefined, text: "carrusel", likeCount: 306, at: "2026-08-25T09:00:00.000Z" });
    expect(m.piezas).toBe(1);
  });

  it("cuenta con solo historias: followers sale del meta de la historia, piezas 0", async () => {
    rows = [
      { author: "somosferro2026", source: "instagram/extension", kind: "story", published_at: "2026-08-25T10:00:00.000Z", created_at: "2026-08-25T10:00:00.000Z", text: "s1", meta: { followers: 1200, expiringAt: new Date(NOW + 3600_000).toISOString() } },
    ];
    const [m] = await accountMetrics("p1", 7, NOW);
    expect(m.followers).toBe(1200);
    expect(m.piezas).toBe(0);
    expect(m.historiasVivas).toBe(1);
  });
});
