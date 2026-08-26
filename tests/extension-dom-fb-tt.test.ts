import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { parseFbProfile, parseFbTimeline } from "../infra/escucha-extension/core/fbdom.js";
import { parseTikTokProfile, parseTikTokTimeline } from "../infra/escucha-extension/core/ttdom.js";

describe("fbdom", () => {
  const doc = new JSDOM(`<html><body>
    <div><span>3,4 mil seguidores</span><span>120 seguidos</span></div>
    <div role="article">
      <div>Ferro presentó el proyecto del nuevo predio para el barrio y la comisión directiva.</div>
      <a href="/ferrooficial/posts/pfbid0123?__cft__[0]=abc&amp;__tn__=x">Ver</a>
      <div aria-label="12 reacciones: Me gusta, Me encanta"></div>
      <span>8 comentarios</span><span>3 veces compartido</span>
    </div>
    <div role="article"><div>corto</div></div>
  </body></html>`).window.document;

  it("seguidores del texto del encabezado", () => {
    expect(parseFbProfile(doc)).toEqual({ followers: 3400 });
    expect(parseFbProfile(new JSDOM("<html><body>nada</body></html>").window.document)).toBeNull();
  });

  it("una publicación con reacciones, comentarios y url normalizada", () => {
    const items = parseFbTimeline(doc, "ferrooficial");
    expect(items).toHaveLength(1);
    expect(items[0].site).toBe("facebook");
    expect(items[0].kind).toBe("post");
    expect(items[0].url).toBe("https://www.facebook.com/ferrooficial/posts/pfbid0123");
    expect(items[0].author).toBe("ferrooficial");
    expect(items[0].metrics).toEqual({ likeCount: 12, commentCount: 8, repostCount: 3, followers: undefined });
  });

  it("sin artículos → []", () => {
    expect(parseFbTimeline(new JSDOM("<html><body></body></html>").window.document, "h")).toEqual([]);
  });
});

describe("ttdom", () => {
  const doc = new JSDOM(`<html><body>
    <strong data-e2e="followers-count">38.2K</strong>
    <div data-e2e="user-post-item">
      <a href="/@ferrooficial/video/7412"><img alt="gol"></a>
      <div data-e2e="video-desc">golazo de contra</div>
      <strong data-e2e="video-views">1.2M</strong>
    </div>
  </body></html>`).window.document;

  it("seguidores de data-e2e followers-count", () => {
    expect(parseTikTokProfile(doc)).toEqual({ followers: 38200 });
    expect(parseTikTokProfile(new JSDOM("<html><body></body></html>").window.document)).toBeNull();
  });

  it("un video con vistas", () => {
    const items = parseTikTokTimeline(doc, "ferrooficial");
    expect(items).toEqual([{
      site: "tiktok",
      kind: "post",
      text: "golazo de contra",
      url: "https://www.tiktok.com/@ferrooficial/video/7412",
      author: "ferrooficial",
      metrics: { viewCount: 1200000, followers: undefined },
    }]);
  });
});
