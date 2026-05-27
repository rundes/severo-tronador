import { describe, it, expect } from "vitest";
import { getUsage, incrementUsage, resetUsage } from "@/lib/quota";

describe("quota", () => {
  it("increment acumula y reset vuelve a 0", async () => {
    await resetUsage("c1");
    expect(await getUsage("c1")).toBe(0);
    await incrementUsage("c1", 3);
    await incrementUsage("c1");
    expect(await getUsage("c1")).toBe(4);
    await resetUsage("c1");
    expect(await getUsage("c1")).toBe(0);
  });
});
