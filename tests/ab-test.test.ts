import { describe, it, expect } from "vitest";
import { pickVariant, chiSquare2x2, type Variant } from "@/lib/ab-test";

const variants: Variant[] = [
  { id: "A", template_id: "t-a", weight: 50 },
  { id: "B", template_id: "t-b", weight: 50 },
];

describe("pickVariant", () => {
  it("0 variantes → null", () => {
    expect(pickVariant([], "1", "c1")).toBeNull();
  });

  it("1 variante → siempre esa", () => {
    const out = pickVariant([variants[0]], "any", "c1");
    expect(out?.id).toBe("A");
  });

  it("determinístico: mismo (dni, campaignId) → misma variante", () => {
    const v1 = pickVariant(variants, "12345", "cmp-x");
    const v2 = pickVariant(variants, "12345", "cmp-x");
    expect(v1?.id).toBe(v2?.id);
  });

  it("distinto dni puede caer en otra variante", () => {
    const picks = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const v = pickVariant(variants, `dni-${i}`, "cmp-x");
      if (v) picks.add(v.id);
    }
    expect(picks.size).toBe(2);
  });

  it("distribución 50/50 cae cerca del peso (±15%)", () => {
    const counts = { A: 0, B: 0 };
    for (let i = 0; i < 1000; i++) {
      const v = pickVariant(variants, `dni-${i}`, "cmp-x");
      if (v) counts[v.id as "A" | "B"]++;
    }
    expect(counts.A / 1000).toBeGreaterThan(0.4);
    expect(counts.A / 1000).toBeLessThan(0.6);
  });

  it("peso 90/10 favorece a A", () => {
    const skew: Variant[] = [
      { id: "A", template_id: "t-a", weight: 90 },
      { id: "B", template_id: "t-b", weight: 10 },
    ];
    const counts = { A: 0, B: 0 };
    for (let i = 0; i < 1000; i++) {
      const v = pickVariant(skew, `dni-${i}`, "cmp-x");
      if (v) counts[v.id as "A" | "B"]++;
    }
    expect(counts.A).toBeGreaterThan(800);
  });

  it("peso 0 en una variante la excluye", () => {
    const skew: Variant[] = [
      { id: "A", template_id: "t-a", weight: 100 },
      { id: "B", template_id: "t-b", weight: 0 },
    ];
    for (let i = 0; i < 50; i++) {
      const v = pickVariant(skew, `dni-${i}`, "cmp-x");
      expect(v?.id).toBe("A");
    }
  });
});

describe("chiSquare2x2", () => {
  it("diferencia clara con muestra grande → significativo", () => {
    const r = chiSquare2x2(
      { sent: 1000, responses: 200 },
      { sent: 1000, responses: 100 },
    );
    expect(r.significant).toBe(true);
    expect(r.pValue).toBeLessThan(0.05);
  });

  it("misma tasa exacta → no significativo", () => {
    const r = chiSquare2x2(
      { sent: 100, responses: 10 },
      { sent: 100, responses: 10 },
    );
    expect(r.significant).toBe(false);
    expect(r.chi2).toBeCloseTo(0, 5);
    expect(r.pValue).toBe(1);
  });

  it("muestra muy chica → flag", () => {
    const r = chiSquare2x2(
      { sent: 5, responses: 1 },
      { sent: 5, responses: 0 },
    );
    expect(r.sampleTooSmall).toBe(true);
    expect(r.significant).toBe(false);
  });

  it("0 envíos en una variante → no rompe", () => {
    const r = chiSquare2x2(
      { sent: 100, responses: 20 },
      { sent: 0, responses: 0 },
    );
    expect(r.chi2).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(r.pValue)).toBe(true);
  });

  it("diferencia chica + muestra mediana → no significativo", () => {
    const r = chiSquare2x2(
      { sent: 200, responses: 20 },
      { sent: 200, responses: 22 },
    );
    expect(r.significant).toBe(false);
    expect(r.sampleTooSmall).toBe(false);
  });
});
