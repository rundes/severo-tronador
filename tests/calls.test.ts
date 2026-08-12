import { describe, it, expect } from "vitest";
import { addManualCall, listCallsFor } from "@/lib/calls";

describe("calls", () => {
  it("agrega y lista por dni scoped al proyecto", async () => {
    await addManualCall("p1", { dni: "555", outcome: "contactado", notes: "ok" });
    const list = await listCallsFor("p1", "555");
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].dni).toBe("555");
  });

  it("no mezcla llamadas entre proyectos", async () => {
    await addManualCall("p1", { dni: "777", outcome: "no_atendio" });
    const otro = await listCallsFor("p2", "777");
    expect(otro).toHaveLength(0);
  });
});
