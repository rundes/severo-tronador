import { describe, it, expect } from "vitest";
import { executeCampaign } from "@/lib/campaigns";
import { listTemplates } from "@/lib/templates";

describe("campañas respetan conector activo", () => {
  it("sin Supabase (conector activo por default) envía normal", async () => {
    const [tpl] = await listTemplates("p1", "email");
    const res = await executeCampaign("p1", {
      nombre: "T",
      channel: "email",
      templateId: tpl.id,
      segmentFilter: { healthMin: 80 },
      preguntas: ["p"],
    });
    expect(res.ok).toBe(true);
  });
});
