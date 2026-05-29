import { describe, it, expect } from "vitest";
import { detectEmerging, sortByEmergence } from "@/lib/emergence";
import type { ListenItem } from "@/lib/connectors/types";

const NOW = Date.UTC(2026, 4, 26);
const DAY = 24 * 60 * 60 * 1000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

function item(
  text: string,
  daysAgo: number,
  source = "meta-ig",
): ListenItem {
  return { source, text, publishedAt: iso(daysAgo) };
}

describe("emergence · detectEmerging", () => {
  it("marca emerging cuando recent >= min y prior=0", () => {
    const items = [
      item("inseguridad creciente", 1),
      item("inseguridad otro robo", 2),
      item("inseguridad creciente desastre", 3),
    ];
    const topics = detectEmerging(["inseguridad"], items, {
      windowDays: 7,
      minVolume: 3,
      ratio: 3,
      now: NOW,
    });
    expect(topics[0].emerging).toBe(true);
    expect(topics[0].recent).toBe(3);
    expect(topics[0].prior).toBe(0);
  });

  it("NO marca emerging si recent < minVolume aunque prior=0", () => {
    const items = [item("inseguridad uno", 1), item("inseguridad dos", 2)];
    const topics = detectEmerging(["inseguridad"], items, {
      windowDays: 7,
      minVolume: 3,
      ratio: 3,
      now: NOW,
    });
    expect(topics[0].emerging).toBe(false);
    expect(topics[0].recent).toBe(2);
  });

  it("marca emerging si recent/prior >= ratio", () => {
    const items = [
      ...Array.from({ length: 6 }, (_, k) => item(`inseguridad #${k}`, 1)),
      item("inseguridad prior", 10),
      item("inseguridad prior 2", 11),
    ];
    const topics = detectEmerging(["inseguridad"], items, {
      windowDays: 7,
      minVolume: 3,
      ratio: 3,
      now: NOW,
    });
    expect(topics[0].emerging).toBe(true);
    expect(topics[0].recent).toBe(6);
    expect(topics[0].prior).toBe(2);
  });

  it("NO marca emerging si crecimiento bajo umbral ratio", () => {
    const items = [
      ...Array.from({ length: 4 }, (_, k) => item(`inseguridad r${k}`, 1)),
      ...Array.from({ length: 4 }, (_, k) => item(`inseguridad p${k}`, 10)),
    ];
    const topics = detectEmerging(["inseguridad"], items, {
      windowDays: 7,
      minVolume: 3,
      ratio: 3,
      now: NOW,
    });
    // recent=4, prior=4 → ratio 1, NO emerging
    expect(topics[0].emerging).toBe(false);
  });

  it("expone bySource discriminando origenes", () => {
    const items = [
      item("inseguridad 1", 1, "meta-ig"),
      item("inseguridad 2", 1, "meta-fb"),
      item("inseguridad 3", 1, "x-api"),
      item("inseguridad 4", 11, "gdelt"),
    ];
    const [t] = detectEmerging(["inseguridad"], items, {
      windowDays: 7,
      minVolume: 3,
      ratio: 3,
      now: NOW,
    });
    expect(t.bySource["meta-ig"].recent).toBe(1);
    expect(t.bySource["meta-fb"].recent).toBe(1);
    expect(t.bySource["x-api"].recent).toBe(1);
    expect(t.bySource["gdelt"].prior).toBe(1);
    expect(t.bySource["gdelt"].recent).toBe(0);
  });

  it("respeta windowDays configurable", () => {
    const items = [
      item("alumbrado uno", 1),
      item("alumbrado dos", 3),
      item("alumbrado tres", 8),
      item("alumbrado cuatro", 9),
    ];
    // ventana 7d: 2 recent + 2 prior
    const w7 = detectEmerging(["alumbrado"], items, {
      windowDays: 7,
      minVolume: 1,
      ratio: 1,
      now: NOW,
    });
    expect(w7[0].recent).toBe(2);
    expect(w7[0].prior).toBe(2);
    // ventana 14d: 4 recent + 0 prior
    const w14 = detectEmerging(["alumbrado"], items, {
      windowDays: 14,
      minVolume: 1,
      ratio: 1,
      now: NOW,
    });
    expect(w14[0].recent).toBe(4);
    expect(w14[0].prior).toBe(0);
  });

  it("sortByEmergence ordena emergentes primero, después por recent desc", () => {
    const out = sortByEmergence([
      { label: "a", emerging: false, recent: 5 },
      { label: "b", emerging: true, recent: 3 },
      { label: "c", emerging: false, recent: 10 },
      { label: "d", emerging: true, recent: 1 },
    ]);
    expect(out.map((x) => x.label)).toEqual(["b", "d", "c", "a"]);
  });
});
