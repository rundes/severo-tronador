import { describe, it, expect, beforeAll } from "vitest";
import {
  AD_FORMATS,
  type AdFormat,
  computeAdMetrics,
  type InsightsRow,
  buildCreativeSpec,
  type ProposalMedia,
  listMyAds,
  setAdStatus,
  getAdPreview,
  listCampaigns,
  listAdsets,
  uploadAdVideo,
  previewProposal,
  createCampaign,
  createAdset,
  createAdFromProposal,
} from "@/lib/meta-ads";
import { getInsights } from "@/lib/meta";

beforeAll(() => {
  delete process.env.META_ACCESS_TOKEN;
  delete process.env.META_AD_ACCOUNT_ID;
  delete process.env.META_PAGE_ID;
});

describe("AD_FORMATS", () => {
  it("incluye los placements clave y no tiene duplicados", () => {
    expect(AD_FORMATS).toContain("MOBILE_FEED_STANDARD");
    expect(AD_FORMATS).toContain("INSTAGRAM_STORY");
    expect(AD_FORMATS).toContain("INSTAGRAM_REELS");
    expect(new Set(AD_FORMATS).size).toBe(AD_FORMATS.length);
  });
});

describe("computeAdMetrics", () => {
  const row: InsightsRow = {
    impressions: "10000",
    reach: "7000",
    frequency: "1.43",
    clicks: "200",
    ctr: "2",
    spend: "50",
    cpc: "0.25",
    cpm: "5",
    actions: [
      { action_type: "link_click", value: "200" },
      { action_type: "landing_page_view", value: "120" },
    ],
  };

  it("expone alcance/frecuencia/clics/CTR/gasto/CPC/CPM y calcula CPA+conversiones", () => {
    const m = computeAdMetrics(row, "link_click");
    const get = (label: string) => m.find((x) => x.label.startsWith(label))?.value;
    expect(get("Impresiones")).toBe(10000);
    expect(get("Alcance")).toBe(7000);
    expect(get("Frecuencia")).toBe(1.43);
    expect(get("Clics")).toBe(200);
    expect(get("CTR")).toBe(2);
    expect(get("Gasto")).toBe(50);
    expect(get("CPC")).toBe(0.25);
    expect(get("CPM")).toBe(5);
    expect(get("Conversiones")).toBe(200);
    expect(get("CPA")).toBeCloseTo(0.25, 5); // 50 / 200
  });

  it("CPA = 0 si no hay conversiones del resultado elegido", () => {
    const m = computeAdMetrics({ ...row, actions: [] }, "link_click");
    expect(m.find((x) => x.label.startsWith("CPA"))?.value).toBe(0);
    expect(m.find((x) => x.label.startsWith("Conversiones"))?.value).toBe(0);
  });
});

describe("buildCreativeSpec", () => {
  const base = { pageId: "PAGE", link: "https://ej.com", cta: "LEARN_MORE", message: "Sumate" };

  it("imagen → link_data con picture (URL) y call_to_action", () => {
    const media: ProposalMedia = { imageUrl: "https://cdn/x.png" };
    const spec = buildCreativeSpec(media, base);
    expect(spec.page_id).toBe("PAGE");
    expect(spec.link_data?.picture).toBe("https://cdn/x.png");
    expect(spec.link_data?.link).toBe("https://ej.com");
    expect(spec.link_data?.message).toBe("Sumate");
    expect(spec.link_data?.call_to_action).toEqual({ type: "LEARN_MORE", value: { link: "https://ej.com" } });
    expect(spec.video_data).toBeUndefined();
  });

  it("video → video_data con video_id (prioriza video sobre imagen)", () => {
    const media: ProposalMedia = { imageUrl: "https://cdn/x.png", videoId: "VID123" };
    const spec = buildCreativeSpec(media, base);
    expect(spec.video_data?.video_id).toBe("VID123");
    expect(spec.video_data?.call_to_action?.type).toBe("LEARN_MORE");
    expect(spec.link_data).toBeUndefined();
  });

  it("lanza si no hay ni imagen ni video", () => {
    expect(() => buildCreativeSpec({}, base)).toThrow(/imagen o video/i);
  });
});

describe("listMyAds (mock, sin credenciales)", () => {
  it("devuelve filas determinísticas con todos los KPIs y mode mock", async () => {
    const a = await listMyAds({ datePreset: "last_7d", status: "all" });
    const b = await listMyAds({ datePreset: "last_7d", status: "all" });
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b); // determinístico
    expect(a[0].mode).toBe("mock");
    const labels = a[0].metrics.map((m) => m.label);
    expect(labels).toEqual(
      expect.arrayContaining(["Impresiones", "CPC (USD)", "CPM (USD)", "CPA (USD)", "Conversiones", "Frecuencia"]),
    );
  });

  it("filtra por estado", async () => {
    const activos = await listMyAds({ datePreset: "last_7d", status: "active" });
    expect(activos.every((r) => r.status === "ACTIVE")).toBe(true);
  });
});

describe("acciones de lectura/estado (mock)", () => {
  it("setAdStatus devuelve ok + mock", async () => {
    const r = await setAdStatus("mock-ad-1", "PAUSED");
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("mock");
    expect(r.status).toBe("PAUSED");
  });

  it("getAdPreview devuelve un frame por formato pedido", async () => {
    const frames = await getAdPreview("mock-ad-1", ["MOBILE_FEED_STANDARD", "INSTAGRAM_STORY"]);
    expect(frames.map((f) => f.format)).toEqual(["MOBILE_FEED_STANDARD", "INSTAGRAM_STORY"]);
    expect(frames[0].html).toContain("Conectá Meta"); // placeholder honesto en mock
  });

  it("listCampaigns / listAdsets devuelven opciones mock", async () => {
    const camps = await listCampaigns();
    expect(camps[0].id).toBeTruthy();
    const adsets = await listAdsets(camps[0].id);
    expect(adsets[0].id).toBeTruthy();
  });
});

describe("creación / preview de propuesta (mock)", () => {
  const spec = buildCreativeSpec({ imageUrl: "https://cdn/x.png" }, {
    pageId: "PAGE", link: "https://ej.com", cta: "LEARN_MORE", message: "Sumate",
  });

  it("uploadAdVideo devuelve videoId mock", async () => {
    const r = await uploadAdVideo("https://cdn/v.mp4");
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("mock");
    expect(r.videoId).toBeTruthy();
  });

  it("previewProposal devuelve un frame por formato (placeholder en mock)", async () => {
    const frames = await previewProposal(spec, ["MOBILE_FEED_STANDARD"]);
    expect(frames[0].format).toBe("MOBILE_FEED_STANDARD");
    expect(frames[0].html).toContain("Conectá Meta");
  });

  it("createCampaign / createAdset / createAdFromProposal devuelven ids mock", async () => {
    const c = await createCampaign({ name: "C", objective: "OUTCOME_TRAFFIC" });
    expect(c.id).toBeTruthy();
    const a = await createAdset({ campaignId: c.id, name: "A", dailyBudgetUsd: 5, days: 7, countries: ["AR"], nowMs: 0 });
    expect(a.id).toBeTruthy();
    const ad = await createAdFromProposal({ adsetId: a.id, spec, name: "Ad" });
    expect(ad.ok).toBe(true);
    expect(ad.id).toBeTruthy();
    expect(ad.mode).toBe("mock");
  });
});

describe("getInsights ad (mock) — KPIs ampliados", () => {
  it("incluye CPC/CPM/CPA/Frecuencia además de los básicos", async () => {
    const r = await getInsights("ad", "algun-ad");
    expect(r.ok).toBe(true);
    const labels = r.metrics.map((m) => m.label);
    expect(labels).toEqual(
      expect.arrayContaining(["Impresiones", "Clics", "CPC (USD)", "CPM (USD)", "CPA (USD)", "Frecuencia"]),
    );
  });
});
