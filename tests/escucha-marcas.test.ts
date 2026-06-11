import { describe, it, expect } from "vitest";
import { itemKey, volumeBuckets } from "@/lib/escucha-marcas";


// ── itemKey ──────────────────────────────────────────────────────────────────

describe("itemKey", () => {
  it("es determinístico: misma semilla → misma clave", () => {
    const seed = "https://example.com/nota-1";
    expect(itemKey(seed)).toBe(itemKey(seed));
  });

  it("semillas distintas → claves distintas (colisión improbable con djb2)", () => {
    const a = itemKey("https://example.com/a");
    const b = itemKey("https://example.com/b");
    expect(a).not.toBe(b);
  });

  it("funciona con semilla de texto sin URL", () => {
    const seed = "La seguridad en el barrio empeoró esta semana";
    expect(itemKey(seed)).toBe(itemKey(seed));
  });

  it("funciona con semilla vacía", () => {
    const k = itemKey("");
    expect(typeof k).toBe("string");
    expect(k.length).toBeGreaterThan(0);
  });

  it("semilla url vs texto distinto → claves distintas", () => {
    const url = itemKey("https://x.com/user/123");
    const text = itemKey("algún texto de ejemplo");
    expect(url).not.toBe(text);
  });
});

// ── volumeBuckets ─────────────────────────────────────────────────────────────

describe("volumeBuckets", () => {
  it("agrupa por día (YYYY-MM-DD) correctamente", () => {
    const items = [
      { publishedAt: "2026-05-20T10:00:00Z" },
      { publishedAt: "2026-05-20T18:30:00Z" },
      { publishedAt: "2026-05-21T09:00:00Z" },
    ];
    const buckets = volumeBuckets(items);
    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toEqual({ day: "2026-05-20", count: 2 });
    expect(buckets[1]).toEqual({ day: "2026-05-21", count: 1 });
  });

  it("devuelve serie ordenada por día ascendente", () => {
    const items = [
      { publishedAt: "2026-05-25T00:00:00Z" },
      { publishedAt: "2026-05-22T00:00:00Z" },
      { publishedAt: "2026-05-24T00:00:00Z" },
    ];
    const buckets = volumeBuckets(items);
    const days = buckets.map((b) => b.day);
    expect(days).toEqual([...days].sort());
  });

  it("ignora items sin publishedAt", () => {
    const items = [
      { publishedAt: "2026-05-20T10:00:00Z" },
      { publishedAt: undefined },
      {},
    ];
    const buckets = volumeBuckets(items);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].count).toBe(1);
  });

  it("ignora publishedAt inválido (texto no fecha)", () => {
    const items = [
      { publishedAt: "not-a-date" },
      { publishedAt: "2026-05-20T10:00:00Z" },
    ];
    const buckets = volumeBuckets(items);
    expect(buckets).toHaveLength(1);
  });

  it("devuelve [] para lista vacía", () => {
    expect(volumeBuckets([])).toEqual([]);
  });

  it("devuelve [] cuando todos los publishedAt son inválidos", () => {
    const items = [{ publishedAt: "bad" }, { publishedAt: "" }];
    expect(volumeBuckets(items)).toEqual([]);
  });

  it("es pura: misma entrada → misma salida", () => {
    const items = [{ publishedAt: "2026-05-20T10:00:00Z" }];
    expect(volumeBuckets(items)).toEqual(volumeBuckets(items));
  });
});
