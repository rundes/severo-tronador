import { describe, it, expect } from "vitest";
import { executeCampaign, getCampaign, listCampaigns } from "@/lib/campaigns";

const P = "p1";

describe("campaigns (memory fallback)", () => {
  it("executeCampaign crea una campaña recuperable con envíos", async () => {
    const res = await executeCampaign(P, {
      nombre: "T", channel: "email", templateId: "tpl-invitacion",
      segmentFilter: { healthMin: 80 }, preguntas: ["p"],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const got = await getCampaign(P, res.campaign.id);
    expect(got?.nombre).toBe("T");
    expect(got?.envios.length).toBeGreaterThan(0);
    expect((await listCampaigns(P)).some((c) => c.id === res.campaign.id)).toBe(true);
    // Aislamiento: otro proyecto no la ve.
    expect(await getCampaign("pB", res.campaign.id)).toBeUndefined();
  });
});
