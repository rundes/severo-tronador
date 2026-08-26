// tests/extension-nav.test.ts
import { describe, it, expect } from "vitest";
import { profileUrl, searchUrl, candidatesFromIgSearch, candidatesFromItems, mergeCandidates } from "../infra/escucha-extension/core/nav.js";

describe("nav · urls", () => {
  it("perfil por plataforma", () => {
    expect(profileUrl("x", "@DeSocios")).toBe("https://x.com/DeSocios");
    expect(profileUrl("facebook", "somosferro")).toBe("https://www.facebook.com/somosferro");
    expect(profileUrl("tiktok", "ferroweb")).toBe("https://www.tiktok.com/@ferroweb");
    expect(profileUrl("instagram", "somosferro2026")).toBe("https://www.instagram.com/somosferro2026/");
  });
  it("búsqueda por plataforma", () => {
    expect(searchUrl("x", "Ferro elecciones")).toBe("https://x.com/search?q=Ferro%20elecciones&src=typed_query&f=live");
    expect(searchUrl("facebook", "Ferro elecciones")).toBe("https://www.facebook.com/search/posts?q=Ferro%20elecciones");
    expect(searchUrl("instagram", "x")).toBeNull();
    expect(searchUrl("tiktok", "x")).toBeNull();
  });
});

describe("nav · candidatos", () => {
  it("de topsearch de Instagram", () => {
    const json = { users: [
      { user: { username: "somosferro2026", full_name: "Somos Ferro", follower_count: 1200, is_verified: false } },
      { user: { username: "identidadverdolaga", full_name: "Identidad Verdolaga" } },
    ] };
    const c = candidatesFromIgSearch(json, "Ferro elecciones");
    expect(c).toEqual([
      { platform: "instagram", handle: "somosferro2026", displayName: "Somos Ferro", followers: 1200, sample: [], query: "Ferro elecciones" },
      { platform: "instagram", handle: "identidadverdolaga", displayName: "Identidad Verdolaga", followers: undefined, sample: [], query: "Ferro elecciones" },
    ]);
  });
  it("de items X/FB agrupa por autor con hasta 3 muestras", () => {
    const items = [1, 2, 3, 4].map((i) => ({ site: "x", author: "@DeSocios", url: `https://x.com/DeSocios/status/${i}`, text: `t${i}`, publishedAt: "2026-08-25" }))
      // @ts-expect-error módulo js sin tipos — TS infiere publishedAt: string del primer map y no acepta undefined acá
      .concat([{ site: "x", author: "otro", url: "https://x.com/otro/status/9", text: "z", publishedAt: undefined }]);
    const c = candidatesFromItems(items, "q");
    expect(c.map((x) => [x.handle, x.sample.length])).toEqual([["desocios", 3], ["otro", 1]]);
    expect(c[0].sample[0]).toEqual({ url: "https://x.com/DeSocios/status/1", text: "t1", at: "2026-08-25" });
    expect(c[0].platform).toBe("x");
  });
  it("mergeCandidates deduplica por plataforma:handle y une muestras", () => {
    const m = mergeCandidates([
      [{ platform: "x", handle: "a", sample: [{ url: "u1", text: "1" }] }],
      [{ platform: "x", handle: "A", sample: [{ url: "u2", text: "2" }], followers: 5 }, { platform: "instagram", handle: "a", sample: [] }],
    ]);
    expect(m).toHaveLength(2);
    // @ts-expect-error módulo js sin tipos — s queda implícitamente any
    expect(m[0].sample.map((s) => s.url)).toEqual(["u1", "u2"]);
    expect(m[0].followers).toBe(5);
  });
});
