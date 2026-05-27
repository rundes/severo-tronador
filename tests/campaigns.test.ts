import { describe, it, expect } from "vitest";
import { executeCampaign, getCampaign, listCampaigns } from "@/lib/campaigns";

describe("campaigns (memory fallback)", () => {
  it("executeCampaign crea una campaña recuperable con envíos", async () => {
    const res = await executeCampaign({
      nombre: "T", channel: "email", templateId: "tpl-invitacion",
      segmentFilter: { healthMin: 80 }, preguntas: ["p"],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const got = await getCampaign(res.campaign.id);
    expect(got?.nombre).toBe("T");
    expect(got?.envios.length).toBeGreaterThan(0);
    expect((await listCampaigns()).some((c) => c.id === res.campaign.id)).toBe(true);
  });
});
