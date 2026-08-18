import { describe, it, expect, beforeEach } from "vitest";
import { consumeRateLimit, resetRateLimits } from "@/lib/rate-limit";

beforeEach(() => {
  resetRateLimits();
});

describe("consumeRateLimit", () => {
  it("deja pasar hasta el límite y frena el siguiente", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(consumeRateLimit("k", 3, 60_000, t0).ok).toBe(true);
    }
    const blocked = consumeRateLimit("k", 3, 60_000, t0);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it("la ventana es deslizante: al vencer vuelve a haber cupo", () => {
    const t0 = 1_000_000;
    expect(consumeRateLimit("k", 1, 60_000, t0).ok).toBe(true);
    expect(consumeRateLimit("k", 1, 60_000, t0 + 30_000).ok).toBe(false);
    expect(consumeRateLimit("k", 1, 60_000, t0 + 61_000).ok).toBe(true);
  });

  it("las claves no se pisan entre sí", () => {
    const t0 = 1_000_000;
    expect(consumeRateLimit("ana", 1, 60_000, t0).ok).toBe(true);
    expect(consumeRateLimit("bob", 1, 60_000, t0).ok).toBe(true);
    expect(consumeRateLimit("ana", 1, 60_000, t0).ok).toBe(false);
  });

  it("retryAfterSeconds se acorta a medida que pasa la ventana", () => {
    const t0 = 1_000_000;
    consumeRateLimit("k", 1, 60_000, t0);
    expect(consumeRateLimit("k", 1, 60_000, t0 + 50_000).retryAfterSeconds).toBe(10);
  });
});
