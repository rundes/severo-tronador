import { describe, it, expect } from "vitest";
import { runListening } from "@/lib/listening";

describe("runListening con config", () => {
  it("sin config (default) trae items del mock y detecta temas", async () => {
    const res = await runListening();
    expect(res.totalItems).toBeGreaterThan(0);
    expect(Array.isArray(res.topics)).toBe(true);
  });
});
