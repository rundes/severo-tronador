import { describe, it, expect, beforeEach, vi } from "vitest";
import { runListening } from "@/lib/listening";

beforeEach(() => {
  // GDELT y X-API ahora hacen fetch real cuando hay creds / sin auth.
  // Para no depender de la red en tests, forzamos fallback al mock.
  vi.stubGlobal("fetch", () => Promise.reject(new Error("no-net (test)")));
});

describe("runListening con config", () => {
  it("sin config (default) trae items del mock y detecta temas", async () => {
    const res = await runListening();
    expect(res.totalItems).toBeGreaterThan(0);
    expect(Array.isArray(res.topics)).toBe(true);
  });
});
