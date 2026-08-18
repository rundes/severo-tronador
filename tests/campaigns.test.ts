import { describe, it, expect } from "vitest";
import { executeCampaign, getCampaign, listCampaigns } from "@/lib/campaigns";
import { listTemplates } from "@/lib/templates";

const P = "p1";

describe("campaigns (memory fallback)", () => {
  it("executeCampaign crea una campaña recuperable con envíos", async () => {
    // Las plantillas son por proyecto: el id de la semilla lleva el proyecto,
    // así que se resuelve en vez de hardcodearlo.
    const [tpl] = await listTemplates(P, "email");
    const res = await executeCampaign(P, {
      nombre: "T", channel: "email", templateId: tpl.id,
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
