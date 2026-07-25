import { describe, it, expect } from "vitest";
import { estimateAllChannels } from "@/lib/segments-cost";

describe("estimateAllChannels (Plan 02 F1.6)", () => {
  it("devuelve los canales activos con shape esperado (sms/voice retirados)", async () => {
    const costs = await estimateAllChannels(100);
    const channels = costs.map((c) => c.channel).sort();
    expect(channels).toEqual(["email", "telegram", "whatsapp"]);
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

  it("sms y voice no se estiman (canales retirados con Telnyx)", async () => {
    const costs = await estimateAllChannels(100);
    expect(costs.find((c) => c.channel === "sms")).toBeUndefined();
    expect(costs.find((c) => c.channel === "voice")).toBeUndefined();
  });
});
