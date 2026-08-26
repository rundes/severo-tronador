// infra/escucha-extension/core/ttdom.js
// Parseo puro del DOM de TikTok (mínimo: seguidores y vistas por video).
// Sin comentarios en esta iteración.
import { parseCount } from "./parse.js";

const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
const MAX_TEXT = 800;
const DESC = '[data-e2e="video-desc"], [data-e2e="browse-video-desc"], [data-e2e="search-card-desc"], [data-e2e="user-post-item-desc"]';

function absTt(href) {
  try {
    const u = new URL(href, "https://www.tiktok.com");
    return `${u.origin}${u.pathname}`;
  } catch {
    return null;
  }
}

export function parseTikTokProfile(doc) {
  const el = doc.querySelector('[data-e2e="followers-count"]');
  const followers = el ? parseCount(clean(el.textContent)) : null;
  return followers == null ? null : { followers };
}

export function parseTikTokTimeline(doc, handle, followers) {
  const items = [];
  const seen = new Set();
  for (const a of doc.querySelectorAll('a[href*="/video/"]')) {
    const url = absTt(a.getAttribute("href"));
    if (!url || seen.has(url)) continue;
    const box = (a.closest && a.closest('[data-e2e="user-post-item"]')) || a.parentElement || a;
    const descEl = box.querySelector(DESC);
    const img = a.querySelector("img[alt]");
    const text = clean(descEl ? descEl.textContent : img ? img.getAttribute("alt") : "");
    if (text.length < 3) continue;
    const viewsEl = box.querySelector('[data-e2e="video-views"]');
    const viewCount = viewsEl ? parseCount(clean(viewsEl.textContent)) : null;
    seen.add(url);
    items.push({
      site: "tiktok",
      kind: "post",
      text: text.slice(0, MAX_TEXT),
      url,
      author: handle || undefined,
      metrics: {
        followers: typeof followers === "number" ? followers : undefined,
        viewCount: viewCount == null ? undefined : viewCount,
      },
    });
  }
  return items;
}
