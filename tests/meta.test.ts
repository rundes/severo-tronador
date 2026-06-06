import { describe, it, expect, beforeAll } from "vitest";
import {
  publishToPage,
  publishToInstagram,
  promotePagePost,
  getInsights,
} from "@/lib/meta";

// Sin credenciales (ni env ni Supabase) → modo mock determinístico.
beforeAll(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.META_ACCESS_TOKEN;
  delete process.env.META_PAGE_ID;
  delete process.env.META_IG_USER_ID;
  delete process.env.META_AD_ACCOUNT_ID;
});

describe("meta · modo mock (sin credenciales)", () => {
  it("publishToPage devuelve id mock sin llamar a la red", async () => {
    const r = await publishToPage({ message: "Hola barrio" });
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("mock");
    expect(r.id).toMatch(/^mock-fb-/);
  });

  it("publishToInstagram devuelve id mock", async () => {
    const r = await publishToInstagram({ imageUrl: "https://x/i.jpg", caption: "hi" });
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("mock");
    expect(r.id).toMatch(/^mock-ig-/);
  });

  it("promotePagePost devuelve id mock", async () => {
    const r = await promotePagePost({
      postId: "123_456",
      dailyBudgetUsd: 5,
      days: 7,
      countries: ["AR"],
      nowMs: 1_700_000_000_000,
    });
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("mock");
    expect(r.id).toMatch(/^mock-ad-/);
  });

  it("ids mock son determinísticos por contenido", async () => {
    const a = await publishToPage({ message: "igual" });
    const b = await publishToPage({ message: "igual" });
    expect(a.id).toBe(b.id);
  });

  it("getInsights devuelve métricas mock estables", async () => {
    const post = await getInsights("post", "123_456");
    expect(post.ok).toBe(true);
    expect(post.mode).toBe("mock");
    expect(post.metrics.length).toBeGreaterThan(0);
    expect(post.metrics[0]).toHaveProperty("label");
    expect(post.metrics[0]).toHaveProperty("value");
    const again = await getInsights("post", "123_456");
    expect(again.metrics[0].value).toBe(post.metrics[0].value);

    const ad = await getInsights("ad", "999");
    expect(ad.metrics.some((m) => m.label.includes("Gasto"))).toBe(true);
  });
});
