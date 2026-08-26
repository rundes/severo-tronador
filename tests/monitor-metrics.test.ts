import { describe, it, expect, vi } from "vitest";
const NOW = Date.UTC(2026, 7, 25, 12);
const PIEZA = "https://www.instagram.com/p/BBB/";
const PIEZA2 = "https://www.instagram.com/p/CCC/";
let rows: Array<Record<string, unknown>> = [
  { author: "somosferro2026", source: "instagram/extension", kind: "story", published_at: "2026-08-25T10:00:00.000Z", created_at: "2026-08-25T10:00:00.000Z", text: "s1", url: null, parent_url: null, meta: { expiringAt: new Date(NOW + 3600_000).toISOString() } },
  { author: "somosferro2026", source: "instagram/extension", kind: "story", published_at: "2026-08-24T10:00:00.000Z", created_at: "2026-08-24T10:00:00.000Z", text: "s0", url: null, parent_url: null, meta: { expiringAt: new Date(NOW - 3600_000).toISOString() } },
  { author: "somosferro2026", source: "instagram/extension", kind: "post", published_at: "2026-08-25T09:00:00.000Z", created_at: "2026-08-25T09:00:00.000Z", text: "carrusel", url: PIEZA, parent_url: null, meta: { followers: 1000, likeCount: 306 } },
];
vi.mock("@/lib/db/supabase", () => ({ dbConfigured: () => true, getSupabase: () => ({ from: () => ({ select: () => ({ eq: () => ({ gte: () => ({ limit: async () => ({ data: rows }) }) }) }) }) }) }));
vi.mock("@/lib/monitor-config", async (o) => ({ ...(await o<typeof import("@/lib/monitor-config")>()), getMonitorConfig: async () => ({ accounts: [{ handle: "somosferro2026", platform: "instagram", category: "organizacion" }], searchesA: [], searchesB: [], entidades: {}, noRepetir: [], calendar: [], budget: {} }) }));
import { accountMetrics } from "@/lib/monitor-metrics";

describe("accountMetrics", () => {
  it("historias vivas cuenta solo las no vencidas; ultimaPieza es el post más reciente", async () => {
    const [m] = await accountMetrics("p1", 7, NOW);
    expect(m.historiasVivas).toBe(1);
    expect(m.ultimaPieza).toEqual({ url: PIEZA, text: "carrusel", likeCount: 306, at: "2026-08-25T09:00:00.000Z" });
    expect(m.piezas).toBe(1);
  });

  it("cuenta con solo historias: followers sale del meta de la historia, piezas 0", async () => {
    rows = [
      { author: "somosferro2026", source: "instagram/extension", kind: "story", published_at: "2026-08-25T10:00:00.000Z", created_at: "2026-08-25T10:00:00.000Z", text: "s1", url: null, parent_url: null, meta: { followers: 1200, expiringAt: new Date(NOW + 3600_000).toISOString() } },
    ];
    const [m] = await accountMetrics("p1", 7, NOW);
    expect(m.followers).toBe(1200);
    expect(m.piezas).toBe(0);
    expect(m.historiasVivas).toBe(1);
  });

  it("los comentarios se asocian por parent_url, no por autor", async () => {
    rows = [
      { author: "somosferro2026", source: "instagram/extension", kind: "post", published_at: "2026-08-25T09:00:00.000Z", created_at: "2026-08-25T09:00:00.000Z", text: "carrusel", url: PIEZA, parent_url: null, meta: { followers: 1000, likeCount: 300 } },
      { author: "somosferro2026", source: "instagram/extension", kind: "post", published_at: "2026-08-24T09:00:00.000Z", created_at: "2026-08-24T09:00:00.000Z", text: "otra", url: PIEZA2, parent_url: null, meta: { followers: 1000, likeCount: 100 } },
      { author: "hincha1", source: "instagram/extension", kind: "comment", published_at: "2026-08-25T10:00:00.000Z", created_at: "2026-08-25T10:00:00.000Z", text: "vamos", url: `${PIEZA}#c1`, parent_url: PIEZA, meta: { likeCount: 4 } },
      { author: "hincha1", source: "instagram/extension", kind: "comment", published_at: "2026-08-24T10:00:00.000Z", created_at: "2026-08-24T10:00:00.000Z", text: "otra vez", url: `${PIEZA2}#c2`, parent_url: PIEZA2, meta: {} },
      { author: "hincha2", source: "instagram/extension", kind: "comment", published_at: "2026-08-25T10:05:00.000Z", created_at: "2026-08-25T10:05:00.000Z", text: "aguante", url: `${PIEZA}#c3`, parent_url: PIEZA, meta: {} },
      { author: "ajeno", source: "instagram/extension", kind: "comment", published_at: "2026-08-25T10:06:00.000Z", created_at: "2026-08-25T10:06:00.000Z", text: "de otra cuenta", url: "https://www.instagram.com/p/ZZZ/#c9", parent_url: "https://www.instagram.com/p/ZZZ/", meta: {} },
    ];
    const [m] = await accountMetrics("p1", 7, NOW);
    expect(m.comentarios).toBe(3);
    expect(m.comentaristas).toBe(2);
    // hincha1 aparece en 2 piezas de 2 comentaristas → 50%.
    expect(m.densidad).toBe(0.5);
    expect(m.muestraComentarios.map((c) => [c.autor, c.text])).toEqual([
      ["c1", "vamos"],
      ["c1", "otra vez"],
      ["c2", "aguante"],
    ]);
  });

  it("sin comentarios: densidad null y contadores en 0", async () => {
    rows = [
      { author: "somosferro2026", source: "instagram/extension", kind: "post", published_at: "2026-08-25T09:00:00.000Z", created_at: "2026-08-25T09:00:00.000Z", text: "carrusel", url: PIEZA, parent_url: null, meta: { followers: 1000 } },
    ];
    const [m] = await accountMetrics("p1", 7, NOW);
    expect(m.comentarios).toBe(0);
    expect(m.comentaristas).toBe(0);
    expect(m.densidad).toBeNull();
    expect(m.muestraComentarios).toEqual([]);
  });
});
