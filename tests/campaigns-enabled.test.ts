import { describe, it, expect } from "vitest";
import { executeCampaign } from "@/lib/campaigns";

describe("campañas respetan conector activo", () => {
  it("sin Supabase (conector activo por default) envía normal", async () => {
    const res = await executeCampaign("p1", {
      nombre: "T",
      channel: "email",
      templateId: "tpl-invitacion",
      segmentFilter: { healthMin: 80 },
      preguntas: ["p"],
    });
    expect(res.ok).toBe(true);
  });
});
