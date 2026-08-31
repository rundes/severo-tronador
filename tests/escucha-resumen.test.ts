import { describe, it, expect } from "vitest";
import { resumirMenciones, esRedSocial, plataformaDe, haceCuanto } from "@/lib/escucha-resumen";
import type { ListenItem } from "@/lib/connectors/types";

const NOW = Date.parse("2026-08-31T12:00:00.000Z");
const hace = (horas: number) => new Date(NOW - horas * 3_600_000).toISOString();

const item = (source: string, horas: number, meta?: Record<string, unknown>): ListenItem => ({
  source,
  text: "x",
  publishedAt: hace(horas),
  ...(meta ? { meta } : {}),
});

describe("resumirMenciones", () => {
  const items: ListenItem[] = [
    item("instagram/extension", 2, { likeCount: 10, commentCount: 3 }),
    item("x/extension", 5, { likeCount: 7 }),
    item("news.google.com", 12),
    item("gdelt", 30),
    item("facebook/somosferro", 40, { likeCount: 5, commentCount: 2 }),
  ];

  it("ventana de 24 h: cuenta solo lo reciente y separa redes de medios", () => {
    const r = resumirMenciones(items, 24, NOW);
    expect(r.total).toBe(3);
    expect(r.enRedes).toBe(2);
    expect(r.enMedios).toBe(1);
    expect(r.meGusta).toBe(17);
    expect(r.comentarios).toBe(3);
  });

  it("ventana de 7 días: entra todo y ordena plataformas por volumen", () => {
    const r = resumirMenciones(items, 24 * 7, NOW);
    expect(r.total).toBe(5);
    expect(r.enRedes).toBe(3);
    expect(r.enMedios).toBe(2);
    expect(r.meGusta).toBe(22);
    expect(r.porPlataforma[0].n).toBeGreaterThanOrEqual(r.porPlataforma.at(-1)!.n);
    expect(r.porPlataforma.map((p) => p.plataforma)).toContain("news.google.com");
  });

  it("item sin fecha cuenta adentro (mismo criterio que get_recent_items)", () => {
    const r = resumirMenciones([{ source: "instagram/extension", text: "x" }], 1, NOW);
    expect(r.total).toBe(1);
  });

  it("métricas ausentes o inválidas suman cero, no NaN", () => {
    const r = resumirMenciones(
      [item("x/extension", 1, { likeCount: "mil", commentCount: -5, viewCount: 100 })],
      24,
      NOW,
    );
    expect(r.meGusta).toBe(0);
    expect(r.comentarios).toBe(0);
  });
});

describe("clasificación de fuentes", () => {
  it("redes vs medios digitales", () => {
    expect(esRedSocial("instagram/extension")).toBe(true);
    expect(esRedSocial("x/extension")).toBe(true);
    expect(esRedSocial("tiktok")).toBe(true);
    expect(esRedSocial("news.google.com")).toBe(false);
    expect(esRedSocial("gdelt")).toBe(false);
    expect(esRedSocial("rss-medios")).toBe(false);
  });

  it("plataformaDe conserva dominios legibles", () => {
    expect(plataformaDe("instagram/extension")).toBe("instagram");
    expect(plataformaDe("news.google.com")).toBe("news.google.com");
  });
});

describe("haceCuanto", () => {
  it("min, horas, días, y null cuando no parsea", () => {
    expect(haceCuanto(hace(0.5 / 60), NOW)).toBe("recién");
    expect(haceCuanto(hace(0.5), NOW)).toBe("hace 30 min");
    expect(haceCuanto(hace(3), NOW)).toBe("hace 3 h");
    expect(haceCuanto(hace(50), NOW)).toBe("hace 2 días");
    expect(haceCuanto("no-fecha", NOW)).toBeNull();
    expect(haceCuanto(undefined, NOW)).toBeNull();
  });
});
