// Content script: ejecuta UNA unidad de colecta a pedido del orquestador (sw).
// Corre en la pestaña de la plataforma (misma sesión, misma IP). Para
// Instagram usa la API interna con credentials:include; para X/FB/TikTok lee
// el DOM. NUNCA invoca endpoints de escritura (lista negra dura, spec §3.5).
//
// Toda la lógica de parseo vive en core/*.js (módulos ESM puros, testeados con
// vitest). Este archivo es un content script clásico: los carga con import()
// dinámico sobre chrome.runtime.getURL, que funciona porque el manifest los
// declara en web_accessible_resources.

// Lista negra: cualquier efecto observable por terceros aborta en runtime.
// OJO: el patrón exige "/comment/" exacto — la LECTURA de comentarios es
// "/comments/" (plural) y no queda bloqueada. No cambiar a "comments?".
const WRITE_BLACKLIST = /\/(like|unlike|friendships\/(create|destroy)|media\/[^/]+\/seen|comment|save|approve)\//i;

const IG_APP_ID = "936619743392459";
const IG_FEED_COUNT = 12;
const IG_COMMENT_PAGES = 2;
const SCROLL_PASSES = 3;
const SCROLL_PAUSE_MS = 2000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Carga perezosa y cacheada de los módulos puros.
let corePromise = null;
function core() {
  if (!corePromise) {
    corePromise = Promise.all([
      import(chrome.runtime.getURL("core/parse.js")),
      import(chrome.runtime.getURL("core/ig.js")),
      import(chrome.runtime.getURL("core/xdom.js")),
      import(chrome.runtime.getURL("core/fbdom.js")),
      import(chrome.runtime.getURL("core/ttdom.js")),
    ]).then(([parse, ig, xdom, fbdom, ttdom]) => ({ parse, ig, xdom, fbdom, ttdom }));
  }
  return corePromise;
}

// ---- Instagram: API interna (spec §4). Solo lectura. ----
async function igFetch(path) {
  if (WRITE_BLACKLIST.test(path)) {
    throw new Error(`endpoint de escritura bloqueado: ${path}`);
  }
  const res = await fetch(path, {
    credentials: "include",
    headers: { "x-ig-app-id": IG_APP_ID },
  });
  const text = await res.text();
  if (!res.ok) return { status: res.status, body: text, json: null };
  let json = null;
  try { json = JSON.parse(text); } catch { /* no-json */ }
  return { status: res.status, body: text, json };
}

// Seguidores del perfil: primero el header, después og:description.
function igFollowersFromDom(parse) {
  const header = document.querySelector("header");
  const fromHeader = header ? parse.parseIgHeader(header.textContent) : null;
  if (fromHeader != null) return { followers: fromHeader, posts: null };
  const og = document.querySelector('meta[property="og:description"]');
  return parse.parseIgOg(og ? og.getAttribute("content") : "");
}

// Unidad completa de una cuenta de IG: perfil (DOM) + feed + historias.
async function igCollect(handle, since) {
  const { parse, ig } = await core();
  const errors = [];
  const { followers, posts } = igFollowersFromDom(parse);
  if (followers == null) errors.push({ step: "profile", detail: "seguidores no encontrados en el DOM" });

  let items = [];
  let pieces = [];
  let userId = null;
  let status = 200;
  let body = "";

  const feed = await igFetch(`/api/v1/feed/user/${encodeURIComponent(handle)}/username/?count=${IG_FEED_COUNT}`);
  status = Math.max(status, feed.status);
  if (!feed.json) {
    body = body || feed.body;
    errors.push({ step: "feed", detail: `HTTP ${feed.status}` });
  } else if (!Array.isArray(feed.json.items) || feed.json.items.length === 0) {
    errors.push({ step: "feed", detail: "feed sin items" });
  } else {
    userId = ig.userIdFromFeed(feed.json);
    const mapped = ig.itemsFromFeed(feed.json, handle, followers == null ? undefined : followers, since);
    items = mapped.items;
    pieces = mapped.pieces;
  }

  if (!userId) userId = ig.userIdFromScripts(document);
  if (userId) {
    const st = await igFetch(`/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(userId)}`);
    status = Math.max(status, st.status);
    if (!st.json) {
      body = body || st.body;
      errors.push({ step: "stories", detail: `HTTP ${st.status}` });
    } else {
      items = items.concat(ig.storiesFromReels(st.json, handle, followers == null ? undefined : followers));
    }
  } else {
    errors.push({ step: "userId", detail: "sin userId: feed vacío y sin profile_id en los scripts" });
  }

  return {
    ok: true,
    status,
    body,
    items,
    pieces,
    profile: { followers: followers == null ? null : followers, posts, userId },
    errors,
  };
}

// Comentarios de UNA pieza, hasta IG_COMMENT_PAGES páginas (~40 comentarios).
async function igComments(pk, url, handle) {
  const { ig } = await core();
  let items = [];
  let status = 200;
  let body = "";
  let minId = null;
  for (let page = 0; page < IG_COMMENT_PAGES; page++) {
    const q = `/api/v1/media/${encodeURIComponent(pk)}/comments/?can_support_threading=true&permalink_enabled=false${minId ? `&min_id=${encodeURIComponent(minId)}` : ""}`;
    const r = await igFetch(q);
    status = Math.max(status, r.status);
    if (!r.json) { body = r.body; break; }
    items = items.concat(ig.commentsFromJson(r.json, url, handle));
    minId = ig.nextMinId(r.json);
    if (!minId) break;
    await sleep(1200 + Math.floor(Math.random() * 800));
  }
  return { ok: true, status, body, items };
}

// ---- DOM: X / Facebook / TikTok ----
async function scrollDown(passes, pauseMs) {
  for (let i = 0; i < passes; i++) {
    window.scrollBy(0, window.innerHeight * 2);
    await sleep(pauseMs);
  }
}

function isX(h) { return h === "x.com" || h.endsWith(".x.com") || h.includes("twitter.com"); }

// Unidad completa de una cuenta de X/FB/TikTok desde su perfil.
async function domProfile(handle, since) {
  const { xdom, fbdom, ttdom } = await core();
  const errors = [];
  await scrollDown(SCROLL_PASSES, SCROLL_PAUSE_MS);
  const h = location.hostname;
  let profile = null;
  let items = [];
  if (isX(h)) {
    profile = xdom.parseXProfile(document);
    items = xdom.parseXTimeline(document, handle, since);
    if (document.querySelectorAll("article").length === 0) errors.push({ step: "parse", detail: "0 artículos" });
  } else if (h.includes("facebook.com")) {
    profile = fbdom.parseFbProfile(document);
    items = fbdom.parseFbTimeline(document, handle, profile ? profile.followers : undefined);
    if (document.querySelectorAll('div[role="article"]').length === 0) errors.push({ step: "parse", detail: "0 artículos" });
  } else if (h.includes("tiktok.com")) {
    profile = ttdom.parseTikTokProfile(document);
    items = ttdom.parseTikTokTimeline(document, handle, profile ? profile.followers : undefined);
    if (document.querySelectorAll('a[href*="/video/"]').length === 0) errors.push({ step: "parse", detail: "0 videos" });
  } else {
    errors.push({ step: "dispatch", detail: `hostname sin parser: ${h}` });
  }
  if (!profile) errors.push({ step: "profile", detail: "seguidores no encontrados en el DOM" });
  // Los seguidores viajan en cada pieza: amplificación/adhesión son server-side.
  if (profile && profile.followers != null) {
    items = items.map((i) => ({ ...i, metrics: { ...i.metrics, followers: profile.followers } }));
  }
  const pieces = items
    .filter((i) => i.kind === "post")
    .map((i) => ({ url: i.url, replyCount: (i.metrics && i.metrics.replyCount) || 0 }));
  return { ok: true, status: 200, items, pieces, profile, errors };
}

// Respuestas de una pieza de X (la pestaña ya está en /status/<id>).
async function domReplies(url, handle) {
  const { xdom } = await core();
  await scrollDown(2, 1500);
  return { ok: true, status: 200, items: xdom.parseXReplies(document, url, handle) };
}

// Búsquedas A/B por DOM (sin `since`: es descubrimiento, no seguimiento).
async function domCollect(handle) {
  const { xdom, fbdom, ttdom } = await core();
  await scrollDown(1, 1500);
  const h = location.hostname;
  let items = [];
  if (isX(h)) items = xdom.parseXTimeline(document, handle, undefined);
  else if (h.includes("facebook.com")) items = fbdom.parseFbTimeline(document, handle, undefined);
  else if (h.includes("tiktok.com")) items = ttdom.parseTikTokTimeline(document, handle, undefined);
  return { ok: true, status: 200, items };
}

// Orquestador → content: ejecutá esta unidad y devolveme datos + status.
chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "ig-collect") {
        sendResponse(await igCollect(msg.handle, msg.since));
      } else if (msg.type === "ig-comments") {
        sendResponse(await igComments(msg.pk, msg.url, msg.handle));
      } else if (msg.type === "dom-profile") {
        sendResponse(await domProfile(msg.handle, msg.since));
      } else if (msg.type === "dom-replies") {
        sendResponse(await domReplies(msg.url, msg.handle));
      } else if (msg.type === "ig-search") {
        const r = await igFetch(`/api/v1/web/search/topsearch/?context=blended&query=${encodeURIComponent(msg.query)}`);
        sendResponse({ ok: true, status: r.status, body: r.body, json: r.json });
      } else if (msg.type === "dom-collect") {
        // msg.query es solo informativo (lo usa el orquestador para armar
        // candidatos); el autor siempre sale del DOM.
        sendResponse(await domCollect(msg.handle));
      } else {
        sendResponse({ ok: false, error: "tipo desconocido" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
  })();
  return true; // async
});
