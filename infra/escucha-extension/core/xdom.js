// Parseo puro del DOM de X: recibe un Document (la pestaña real o un fixture
// de jsdom) y devuelve items del contrato de /api/extension/items.
// Usa textContent/getAttribute — NUNCA innerText, que jsdom no implementa.
import { parseCount, parseXGroupLabel } from "./parse.js";

const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
const MAX_TEXT = 800;
export const ARTICLES = 'article[data-testid="tweet"], article[role="article"]';
// handle = path de un solo segmento; nunca rutas de la app.
const X_HANDLE_PATH = /^\/[A-Za-z0-9_]{1,15}$/;
const X_NON_HANDLE_PATHS = new Set(["/i", "/home", "/explore", "/search", "/notifications", "/messages"]);

function absX(href) {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  return `https://x.com${href.startsWith("/") ? href : `/${href}`}`;
}

function authorFrom(article, fallback) {
  for (const a of article.querySelectorAll('[data-testid="User-Name"] a[href^="/"]')) {
    const href = a.getAttribute("href") || "";
    if (X_HANDLE_PATH.test(href) && !X_NON_HANDLE_PATHS.has(href.toLowerCase())) return href.slice(1);
  }
  return fallback || undefined;
}

function statusUrl(article) {
  for (const a of article.querySelectorAll('a[href*="/status/"]')) {
    const href = a.getAttribute("href") || "";
    const m = href.match(/^(?:https?:\/\/[^/]+)?(\/[^/]+\/status\/\d+)/);
    if (m) return absX(m[1]);
  }
  return null;
}

function metricsFrom(article) {
  const group = article.querySelector('[role="group"][aria-label]');
  if (!group) return {};
  const g = parseXGroupLabel(group.getAttribute("aria-label"));
  return { likeCount: g.likes, replyCount: g.replies, repostCount: g.reposts, viewCount: g.views };
}

// Nunca el textContent del artículo entero: eso mete la interfaz (Responder,
// Repostear, Me gusta) adentro del texto de la pieza. Sin tweetText, el alt de
// la imagen; y si tampoco hay, un placeholder honesto.
function textFrom(article) {
  const node = article.querySelector('[data-testid="tweetText"]');
  const text = clean(node ? node.textContent : "");
  if (text) return text;
  const img = article.querySelector("img[alt]");
  return clean(img ? img.getAttribute("alt") : "") || "(tweet sin texto)";
}

// Un repost no es una pieza de la cuenta: lo escribió otro.
const REPOST = /reposte[oó]|reposted|retwitte[oó]|retweeted/i;
function isRepost(article) {
  const ctx = article.querySelector('[data-testid="socialContext"]');
  return !!ctx && REPOST.test(clean(ctx.textContent));
}

// Une los nodos de texto descendientes con espacios: X pega "38,2 mil" y
// "Seguidores" en spans contiguos y textContent devuelve "38,2 milSeguidores",
// donde el sufijo "mil" deja de ser sufijo y parseCount lee 38 en vez de 38200.
function joinedText(el) {
  if (!el) return "";
  const parts = [];
  const walk = (node) => {
    for (const child of node.childNodes || []) {
      if (child.nodeType === 3) parts.push(child.textContent);
      else walk(child);
    }
  };
  walk(el);
  return clean(parts.join(" "));
}

// Seguidores del perfil: "38,2 mil Seguidores" en a[href$="/followers"].
export function parseXProfile(doc) {
  const link = doc.querySelector('a[href$="/followers"], a[href$="/verified_followers"]');
  const followers = link ? parseCount(joinedText(link)) : null;
  return followers == null ? null : { followers };
}

// Piezas del timeline del perfil. Filtra por time[datetime] posterior a
// `sinceIso`, NUNCA por posición (los fijados van primero).
export function parseXTimeline(doc, handle, sinceIso) {
  const sinceMs = sinceIso ? +new Date(sinceIso) : NaN;
  const items = [];
  const seen = new Set();
  for (const art of doc.querySelectorAll(ARTICLES)) {
    if (isRepost(art)) continue;
    const url = statusUrl(art);
    if (!url || seen.has(url)) continue;
    const text = textFrom(art);
    if (text.length < 5) continue;
    const time = art.querySelector("time[datetime]");
    const publishedAt = time ? time.getAttribute("datetime") : undefined;
    if (publishedAt && Number.isFinite(sinceMs) && +new Date(publishedAt) <= sinceMs) continue;
    seen.add(url);
    items.push({
      site: "x",
      kind: "post",
      text: text.slice(0, MAX_TEXT),
      url,
      author: authorFrom(art, handle),
      publishedAt,
      metrics: metricsFrom(art),
    });
  }
  return items;
}

// Respuestas a una pieza (página /status/<id>): el PRIMER artículo es la
// pieza madre, no una respuesta. Las respuestas de la propia cuenta no son
// comentaristas: se descartan.
export function parseXReplies(doc, parentUrl, handle) {
  const arts = Array.from(doc.querySelectorAll(ARTICLES)).slice(1);
  const own = String(handle || "").replace(/^@/, "").toLowerCase();
  const items = [];
  const seen = new Set();
  for (const art of arts) {
    const url = statusUrl(art);
    if (!url || url === parentUrl || seen.has(url)) continue;
    const author = authorFrom(art, undefined);
    if (!author) continue;
    if (own && author.toLowerCase() === own) continue;
    const text = textFrom(art);
    if (!text) continue;
    const time = art.querySelector("time[datetime]");
    seen.add(url);
    items.push({
      site: "x",
      kind: "comment",
      text: text.slice(0, MAX_TEXT),
      url,
      author,
      parentUrl,
      publishedAt: time ? time.getAttribute("datetime") : undefined,
      metrics: metricsFrom(art),
    });
  }
  return items;
}
