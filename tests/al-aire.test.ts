import { describe, it, expect } from "vitest";
import { alAireState } from "@/lib/al-aire";

const NOW = Date.UTC(2026, 7, 25, 12, 0, 0);
const occ = (station: string, startMin: number, endMin: number) => ({ station, programa: "P", startMs: NOW + startMin * 60_000, endMs: NOW + endMin * 60_000 });

describe("alAireState", () => {
  it("grabando ahora, próximo y último", () => {
    const s = alAireState(
      [occ("LU30", -30, 30), occ("Canal", 40, 100)],
      [{ id: "1", station: "R", programa: "X", status: "done", mentions: 3, scheduledStart: new Date(NOW - 3 * 3600_000).toISOString() } as never],
      NOW,
    );
    if (!s) throw new Error("se esperaba estado");
    expect(s.grabando?.station).toBe("LU30");
    expect(s.proximo?.station).toBe("Canal");
    expect(s.proximo?.enMin).toBe(40);
    expect(s.ultimo?.station).toBe("R");
    expect(s.ultimo?.mentions).toBe(3);
  });

  it("sin datos → null", () => {
    expect(alAireState([], [], NOW)).toBeNull();
  });
});
