// infra/escucha-extension/core/fbdom.js
// Parseo puro del DOM de Facebook (mínimo: seguidores del encabezado y, por
// publicación, reacciones/comentarios/compartidos). Sin abrir comentarios:
// eso requiere clics y queda fuera de esta iteración.
import { countBefore, parseCount } from "./parse.js";

const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
const MAX_TEXT = 800;
const POST_HREF = /\/(posts|permalink|videos|reel)\/|pfbid|story_fbid/;
const KEEP_PARAMS = ["story_fbid", "fbid", "id", "v"];

// URL estable para el dedupe por (project_id, url): fuera los parámetros de
// tracking (__cft__, __tn__), que cambian en cada carga.
function absFb(href) {
  try {
    const u = new URL(href, "https://www.facebook.com");
    const keep = new URLSearchParams();
    for (const k of KEEP_PARAMS) {
      const v = u.searchParams.get(k);
      if (v) keep.set(k, v);
    }
    const q = keep.toString();
    return `${u.origin}${u.pathname}${q ? `?${q}` : ""}`;
  } catch {
    return null;
  }
}

function reactionsFrom(article) {
  for (const el of article.querySelectorAll("[aria-label]")) {
    const label = el.getAttribute("aria-label") || "";
    if (!/reaccion|reaction|me gusta|like/i.test(label)) continue;
    const n = parseCount(label);
    if (n != null) return n;
  }
  return undefined;
}

// Los seguidores salen del encabezado del perfil ([role="main"]): el body
// entero trae "Páginas sugeridas" con SUS seguidores y se colaban como propios.
// El body queda como último recurso (no siempre hay role="main").
export function parseFbProfile(doc) {
  const main = doc && typeof doc.querySelector === "function" ? doc.querySelector('[role="main"]') : null;
  const fromMain = main ? countBefore(main.textContent, "seguidores|followers") : null;
  const followers = fromMain != null
    ? fromMain
    : countBefore(doc && doc.body ? doc.body.textContent : "", "seguidores|followers");
  return followers == null ? null : { followers };
}

export function parseFbTimeline(doc, handle, followers) {
  const items = [];
  const seen = new Set();
  for (const art of doc.querySelectorAll('div[role="article"]')) {
    const text = clean(art.textContent);
    if (text.length < 25) continue;
    let url = null;
    for (const a of art.querySelectorAll("a[href]")) {
      const h = a.getAttribute("href") || "";
      if (POST_HREF.test(h)) { url = absFb(h); break; }
    }
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const commentCount = countBefore(text, "comentarios|comments");
    const repostCount = countBefore(text, "veces compartido|compartidos|shares|share");
    items.push({
      site: "facebook",
      kind: "post",
      text: text.slice(0, MAX_TEXT),
      url,
      author: handle || undefined,
      metrics: {
        followers: typeof followers === "number" ? followers : undefined,
        likeCount: reactionsFrom(art),
        commentCount: commentCount == null ? undefined : commentCount,
        repostCount: repostCount == null ? undefined : repostCount,
      },
    });
  }
  return items;
}
