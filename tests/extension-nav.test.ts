// tests/extension-nav.test.ts
import { describe, it, expect } from "vitest";
import { profileUrl, searchUrl, candidatesFromIgSearch, candidatesFromItems, mergeCandidates, sameHost, isOnTarget } from "../infra/escucha-extension/core/nav.js";

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

describe("nav · robustez (handles válidos, topsearch null-safe, encode)", () => {
  it("candidatesFromIgSearch tolera json nulo o malformado", () => {
    for (const bad of [null, undefined, {}, { users: {} }, { users: [null] }, { users: [{ user: null }, { user: { username: 42 } }] }]) {
      expect(candidatesFromIgSearch(bad, "q")).toEqual([]);
    }
  });
  it("candidatesFromIgSearch tolera full_name/follower_count con tipos raros", () => {
    const c = candidatesFromIgSearch({ users: [{ username: "Ok_User", full_name: 7, follower_count: "1200" }] }, "q");
    expect(c).toEqual([{ platform: "instagram", handle: "ok_user", displayName: undefined, followers: undefined, sample: [], query: "q" }]);
  });
  it("descarta handles inválidos (espacios, largo >80, vacío) y slugs no-handle", () => {
    const mk = (author: string, site = "facebook") => ({ site, author, url: "https://www.facebook.com/x/posts/1", text: "t", publishedAt: "2026-08-25" });
    const items = [
      mk("Juan Pérez"),
      mk("a".repeat(81)),
      mk(""),
      mk("@"),
      mk("profile.php"),
      mk("people"),
      mk("reel"),
      mk("permalink.php"),
      mk("somosferro"),
      mk("ok.handle-1"),
    ];
    expect(candidatesFromItems(items, "q").map((c) => c.handle)).toEqual(["somosferro", "ok.handle-1"]);
    expect(candidatesFromIgSearch({ users: [{ username: "Nombre Con Espacios" }, { username: "explore" }, { username: "bien" }] }, "q").map((c: { handle: string }) => c.handle)).toEqual(["bien"]);
  });
  it("recorta text a 500 y descarta muestras con url inválida o >600", () => {
    const long = "x".repeat(900);
    const items = [
      { site: "x", author: "a", url: "https://x.com/a/status/1", text: long, publishedAt: "2026-08-25" },
      { site: "x", author: "a", url: "https://x.com/a/" + "z".repeat(600), text: "t", publishedAt: "2026-08-25" },
      { site: "x", author: "a", url: "javascript:alert(1)", text: "t", publishedAt: "2026-08-25" },
      { site: "x", author: "a", url: "", text: "t", publishedAt: "2026-08-25" },
      { site: "x", author: "b", url: "not a url", text: "t", publishedAt: "2026-08-25" },
    ];
    const c = candidatesFromItems(items, "q");
    expect(c.map((x) => [x.handle, x.sample.length])).toEqual([["a", 1]]);
    expect(c[0].sample[0].text).toHaveLength(500);
  });
  it("mergeCandidates limita a 3 muestras entre listas", () => {
    const m = mergeCandidates([
      [{ platform: "x", handle: "a", sample: [{ url: "u1", text: "1" }, { url: "u2", text: "2" }] }],
      [{ platform: "x", handle: "a", sample: [{ url: "u3", text: "3" }, { url: "u4", text: "4" }] }],
    ]);
    expect(m).toHaveLength(1);
    expect(m[0].sample).toHaveLength(3);
  });
  it("profileUrl codifica el handle", () => {
    expect(profileUrl("x", "a b/c?d")).toBe("https://x.com/a%20b%2Fc%3Fd");
    expect(profileUrl("instagram", "@ok")).toBe("https://www.instagram.com/ok/");
  });
});

describe("nav · sameHost / isOnTarget", () => {
  it("sameHost compara hostname, no substring", () => {
    expect(sameHost("https://www.dropbox.com/home", "x.com")).toBe(false);
    expect(sameHost("https://notx.com/", "x.com")).toBe(false);
    expect(sameHost("https://www.x.com/a", "x.com")).toBe(true);
    expect(sameHost("https://mobile.x.com/a", "x.com")).toBe(true);
    expect(sameHost("https://x.com/a", "x.com")).toBe(true);
    expect(sameHost("https://www.instagram.com/", "www.instagram.com")).toBe(true);
  });
  it("sameHost devuelve false con url inválida o host vacío", () => {
    expect(sameHost("no es url", "x.com")).toBe(false);
    expect(sameHost("", "x.com")).toBe(false);
    expect(sameHost(undefined, "x.com")).toBe(false);
    expect(sameHost("https://x.com/", "")).toBe(false);
  });
  it("isOnTarget compara origin+pathname e ignora query/hash", () => {
    expect(isOnTarget("https://x.com/search?q=a&f=live", "https://x.com/search?q=a")).toBe(true);
    expect(isOnTarget("https://x.com/DeSocios/with_replies", "https://x.com/DeSocios")).toBe(true);
    expect(isOnTarget("https://x.com/otro", "https://x.com/DeSocios")).toBe(false);
    expect(isOnTarget("https://www.x.com/DeSocios", "https://x.com/DeSocios")).toBe(false);
    expect(isOnTarget("bad", "https://x.com/")).toBe(false);
  });
});
