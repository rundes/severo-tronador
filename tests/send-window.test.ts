import { describe, it, expect } from "vitest";
import { isInWindow, nextWindowStart } from "@/lib/send-window";

describe("isInWindow", () => {
  it("sin window → siempre true", () => {
    expect(
      isInWindow({ startHour: null, endHour: null }, new Date("2026-05-28T03:00:00Z")),
    ).toBe(true);
  });

  it("ventana 12-22 a las 15 UTC → true", () => {
    expect(
      isInWindow({ startHour: 12, endHour: 22 }, new Date("2026-05-28T15:00:00Z")),
    ).toBe(true);
  });

  it("ventana 12-22 a las 23 UTC → false", () => {
    expect(
      isInWindow({ startHour: 12, endHour: 22 }, new Date("2026-05-28T23:00:00Z")),
    ).toBe(false);
  });

  it("ventana cruza medianoche 22-06 a las 23 UTC → true", () => {
    expect(
      isInWindow({ startHour: 22, endHour: 6 }, new Date("2026-05-28T23:00:00Z")),
    ).toBe(true);
  });

  it("ventana cruza medianoche 22-06 a las 03 UTC → true", () => {
    expect(
      isInWindow({ startHour: 22, endHour: 6 }, new Date("2026-05-28T03:00:00Z")),
    ).toBe(true);
  });

  it("ventana cruza medianoche 22-06 a las 12 UTC → false", () => {
    expect(
      isInWindow({ startHour: 22, endHour: 6 }, new Date("2026-05-28T12:00:00Z")),
    ).toBe(false);
  });
});

describe("nextWindowStart", () => {
  it("antes del start hoy → start hoy", () => {
    const now = new Date("2026-05-28T03:00:00Z");
    const r = nextWindowStart({ startHour: 12, endHour: 22 }, now);
    expect(r).toBe("2026-05-28T12:00:00.000Z");
  });

  it("después del end hoy → start mañana", () => {
    const now = new Date("2026-05-28T23:00:00Z");
    const r = nextWindowStart({ startHour: 12, endHour: 22 }, now);
    expect(r).toBe("2026-05-29T12:00:00.000Z");
  });

  it("sin start → ahora (no se rescheduea)", () => {
    const now = new Date("2026-05-28T12:34:56Z");
    expect(nextWindowStart({ startHour: null, endHour: null }, now)).toBe(
      now.toISOString(),
    );
  });
});
