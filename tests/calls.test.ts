import { describe, it, expect } from "vitest";
import { addManualCall, listCallsFor } from "@/lib/calls";

describe("calls", () => {
  it("agrega y lista por dni", async () => {
    await addManualCall({ dni: "555", outcome: "contactado", notes: "ok" });
    const list = await listCallsFor("555");
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].dni).toBe("555");
  });
});
