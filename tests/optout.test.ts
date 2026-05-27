import { describe, it, expect } from "vitest";
import { optOut, isOptedOut, optedOutSet } from "@/lib/optout";

describe("optout", () => {
  it("optOut marca y no se pisa; isOptedOut true; set contiene dni", async () => {
    await optOut("999", "test");
    await optOut("999", "otra");
    expect(await isOptedOut("999")).toBe(true);
    expect(await isOptedOut("000")).toBe(false);
    expect((await optedOutSet()).has("999")).toBe(true);
  });
});
