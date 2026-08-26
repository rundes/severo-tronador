import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { userIdFromFeed, userIdFromScripts, mediaUrl, itemsFromFeed, commentsFromJson, nextMinId, storiesFromReels } from "../infra/escucha-extension/core/ig.js";

const at = (iso: string) => Math.floor(+new Date(iso) / 1000);

const feed = {
  items: [
    // Fijado: es el más viejo pero viene primero. NO se filtra por posición.
    { pk: "111", code: "AAA", media_type: 1, taken_at: at("2026-08-10T12:00:00.000Z"), like_count: 10, comment_count: 2, caption: { text: "fijado" }, user: { pk: 9001 } },
    { pk: "222", code: "BBB", media_type: 8, taken_at: at("2026-08-25T12:00:00.000Z"), like_count: 306, comment_count: 41, caption: { text: "carrusel del domingo" }, user: { pk: 9001 } },
    { pk: "333", code: "CCC", media_type: 2, taken_at: at("2026-08-26T09:00:00.000Z"), like_count: 88, comment_count: 7, play_count: 5400, caption: null, user: { pk: 9001 } },
  ],
};

describe("ig · feed", () => {
  it("userId sale del primer item con user.pk", () => {
    expect(userIdFromFeed(feed)).toBe("9001");
    expect(userIdFromFeed({ items: [] })).toBeNull();
    expect(userIdFromFeed(null)).toBeNull();
  });

  it("filtra por taken_at, nunca por posición, y mapea kind y métricas", () => {
    const { items, pieces } = itemsFromFeed(feed, "ferrooficial", 136000, "2026-08-20T00:00:00.000Z");
    expect(items.map((i) => i.url)).toEqual([
      "https://www.instagram.com/p/BBB/",
      "https://www.instagram.com/p/CCC/",
    ]);
    expect(items[0]).toEqual({
      site: "instagram",
      kind: "post",
      text: "carrusel del domingo",
      url: "https://www.instagram.com/p/BBB/",
      author: "ferrooficial",
      publishedAt: "2026-08-25T12:00:00.000Z",
      metrics: {
        followers: 136000,
        likeCount: 306,
        commentCount: 41,
        viewCount: undefined,
        takenAt: "2026-08-25T12:00:00.000Z",
      },
    });
    expect(items[1].kind).toBe("reel");
    expect(items[1].metrics.viewCount).toBe(5400);
    expect(items[1].text).toBe("(publicación sin texto)");
    expect(pieces).toEqual([
      { pk: "222", url: "https://www.instagram.com/p/BBB/", commentCount: 41 },
      { pk: "333", url: "https://www.instagram.com/p/CCC/", commentCount: 7 },
    ]);
  });

  it("sin since devuelve todo; pieza sin taken_at se guarda con publishedAt undefined", () => {
    const json = { items: [{ pk: "1", code: "X", media_type: 1, caption: { text: "sin fecha" }, user: { pk: 1 } }] };
    const { items } = itemsFromFeed(json, "h", undefined, "2026-08-20T00:00:00.000Z");
    expect(items).toHaveLength(1);
    expect(items[0].publishedAt).toBeUndefined();
    expect(items[0].metrics.followers).toBeUndefined();
  });

  it("json roto → listas vacías", () => {
    for (const bad of [null, undefined, {}, { items: null }, { items: [null] }]) {
      expect(itemsFromFeed(bad, "h", 1, undefined)).toEqual({ items: [], pieces: [] });
    }
  });

  it("mediaUrl cae a /media/<pk>/ sin code", () => {
    expect(mediaUrl("123", "ABC")).toBe("https://www.instagram.com/p/ABC/");
    expect(mediaUrl("123", null)).toBe("https://www.instagram.com/media/123/");
  });
});

describe("ig · comentarios", () => {
  const json = {
    comments: [
      { pk: "1", text: "vamos ferro  ", created_at: at("2026-08-25T13:00:00.000Z"), comment_like_count: 4, user: { username: "hincha1" } },
      { pk: "2", text: "gracias!", created_at: at("2026-08-25T13:05:00.000Z"), comment_like_count: 0, user: { username: "ferrooficial" } },
      { pk: "3", text: "", created_at: at("2026-08-25T13:06:00.000Z"), user: { username: "hincha2" } },
      { pk: "4", text: "otro", created_at: at("2026-08-25T13:07:00.000Z"), user: null },
    ],
    next_min_id: "MIN2",
  };

  it("mapea a kind comment con url única y descarta la respuesta de la propia cuenta", () => {
    const items = commentsFromJson(json, "https://www.instagram.com/p/BBB/", "ferrooficial");
    expect(items).toEqual([
      {
        site: "instagram",
        kind: "comment",
        text: "vamos ferro",
        url: "https://www.instagram.com/p/BBB/#c1",
        author: "hincha1",
        parentUrl: "https://www.instagram.com/p/BBB/",
        publishedAt: "2026-08-25T13:00:00.000Z",
        metrics: { likeCount: 4 },
      },
    ]);
  });

  it("nextMinId devuelve el cursor o null", () => {
    expect(nextMinId(json)).toBe("MIN2");
    expect(nextMinId({ comments: [] })).toBeNull();
    expect(nextMinId(null)).toBeNull();
  });
});

describe("ig · historias y userId de scripts", () => {
  it("reels_media → items kind story con expiringAt", () => {
    const json = {
      reels_media: [{
        items: [
          { pk: "s1", taken_at: at("2026-08-26T08:00:00.000Z"), expiring_at: at("2026-08-27T08:00:00.000Z"), accessibility_caption: "Foto de la cancha" },
          { pk: "s2", taken_at: at("2026-08-26T09:00:00.000Z") },
        ],
      }],
    };
    const items = storiesFromReels(json, "ferrooficial", 136000);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      site: "instagram",
      kind: "story",
      text: "Foto de la cancha",
      url: "https://www.instagram.com/stories/ferrooficial/s1/",
      author: "ferrooficial",
      publishedAt: "2026-08-26T08:00:00.000Z",
      metrics: {
        followers: 136000,
        takenAt: "2026-08-26T08:00:00.000Z",
        expiringAt: "2026-08-27T08:00:00.000Z",
      },
    });
    expect(items[1].text).toBe("(historia sin texto alternativo)");
    expect(storiesFromReels(null, "h", 1)).toEqual([]);
  });

  it("userIdFromScripts saca profile_id de los scripts de la página", () => {
    const doc = new JSDOM(`<html><body><script>window.__d({"profile_id":"9001","x":1})</script></body></html>`).window.document;
    expect(userIdFromScripts(doc)).toBe("9001");
    const vacio = new JSDOM(`<html><body><script>nada</script></body></html>`).window.document;
    expect(userIdFromScripts(vacio)).toBeNull();
  });
});
