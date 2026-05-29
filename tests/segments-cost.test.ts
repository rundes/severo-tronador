import { describe, it, expect } from "vitest";
import { estimateAllChannels } from "@/lib/segments-cost";

describe("estimateAllChannels (Plan 02 F1.6)", () => {
  it("devuelve todos los canales con shape esperado", async () => {
    const costs = await estimateAllChannels(100);
    const channels = costs.map((c) => c.channel).sort();
    expect(channels).toEqual([
      "email",
      "sms",
      "telegram",
      "voice",
      "whatsapp",
    ]);
    for (const c of costs) {
      expect(c.count).toBe(100);
      expect(c.unit).toBeTypeOf("string");
      expect(typeof c.estUsd).toBe("number");
      expect(typeof c.willFit).toBe("boolean");
    }
  });

  it("email free tier cubre 100 envíos → cost 0", async () => {
    const costs = await estimateAllChannels(100);
    const email = costs.find((c) => c.channel === "email")!;
    expect(email.willFit).toBe(true);
    expect(email.estUsd).toBe(0);
  });

  it("SMS sin free tier → estUsd > 0", async () => {
    const costs = await estimateAllChannels(100);
    const sms = costs.find((c) => c.channel === "sms")!;
    expect(sms.estUsd).toBeGreaterThan(0);
    expect(sms.costPerUnit).toBe(0.04);
    expect(sms.estUsd).toBeCloseTo(100 * 0.04, 5);
  });

  it("Voz estima 2 min/llamada", async () => {
    const costs = await estimateAllChannels(50);
    const voice = costs.find((c) => c.channel === "voice")!;
    expect(voice.paidUnits).toBeGreaterThanOrEqual(50 * 2);
    expect(voice.estUsd).toBeCloseTo(50 * 2 * 0.004, 5);
  });
});
