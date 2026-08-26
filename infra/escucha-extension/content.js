// Content script: ejecuta UNA unidad de colecta a pedido del orquestador (sw).
// Corre en la pestaña de la plataforma (misma sesión, misma IP). Para
// Instagram usa la API interna con credentials:include; para X/FB/TikTok lee
// el DOM. NUNCA invoca endpoints de escritura (lista negra dura, spec §3.5).

// Lista negra: cualquier efecto observable por terceros aborta en runtime.
const WRITE_BLACKLIST = /\/(like|unlike|friendships\/(create|destroy)|media\/[^/]+\/seen|comment|save|approve)\//i;

function clean(s) { return (s || "").replace(/\s+/g, " ").trim(); }
function abs(h) { try { return new URL(h, location.href).toString(); } catch { return null; } }

// ---- Instagram: API interna (spec §4). Solo lectura. ----
const IG_APP_ID = "936619743392459";

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

async function igProfile(handle) {
  const r = await igFetch(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`);
  if (!r.json) return { status: r.status, body: r.body, user: null };
  const u = r.json.data && r.json.data.user;
  return {
    status: r.status,
    user: u && {
      id: u.id,
      followers: u.edge_followed_by ? u.edge_followed_by.count : 0,
      posts: u.edge_owner_to_timeline_media ? u.edge_owner_to_timeline_media.count : 0,
    },
  };
}

function igMediaUrl(pk, code) {
  return code ? `https://www.instagram.com/p/${code}/` : `https://www.instagram.com/media/${pk}/`;
}

async function igFeed(userId, handle, followers) {
  const r = await igFetch(`/api/v1/feed/user/${userId}/?count=24`);
  if (!r.json) return { status: r.status, body: r.body, items: [] };
  const items = (r.json.items || []).map((it) => ({
    site: "instagram",
    kind: it.media_type === 2 ? "reel" : "post",
    text: clean((it.caption && it.caption.text) || "").slice(0, 800),
    url: igMediaUrl(it.pk, it.code),
    author: handle,
    metrics: {
      followers,
      likeCount: it.like_count,
      commentCount: it.comment_count,
      viewCount: it.play_count || it.view_count,
      takenAt: it.taken_at ? new Date(it.taken_at * 1000).toISOString() : undefined,
    },
  })).filter((i) => i.text.length >= 1);
  return { status: r.status, items };
}

async function igStories(userId, handle, followers) {
  const r = await igFetch(`/api/v1/feed/reels_media/?reel_ids=${userId}`);
  if (!r.json) return { status: r.status, body: r.body, items: [] };
  const reel = (r.json.reels_media || [])[0];
  const items = ((reel && reel.items) || []).map((it) => ({
    site: "instagram",
    kind: "story",
    text: clean(it.accessibility_caption || "(historia sin texto alternativo)").slice(0, 800),
    url: `https://www.instagram.com/stories/${handle}/${it.pk}/`,
    author: handle,
    metrics: {
      followers,
      takenAt: it.taken_at ? new Date(it.taken_at * 1000).toISOString() : undefined,
      expiringAt: it.expiring_at ? new Date(it.expiring_at * 1000).toISOString() : undefined,
    },
  }));
  return { status: r.status, items };
}

// ---- DOM: X / Facebook / TikTok ----
// FB: primer segmento de https://…facebook.com/<slug>/… como autor, salvo que
// sea un path no-perfil (grupos, foto, permalink de post).
const FB_AUTHOR_SLUG = /facebook\.com\/(?!groups\/|photo|posts\/)([^/?#]+)/i;

function domX(handle) {
  const out = [];
  for (const t of document.querySelectorAll('article[data-testid="tweet"]')) {
    const text = clean(t.querySelector('[data-testid="tweetText"]') && t.querySelector('[data-testid="tweetText"]').innerText);
    if (text.length < 5) continue;
    const link = t.querySelector('a[href*="/status/"]');
    const url = link ? abs(link.getAttribute("href")) : null;
    if (!url) continue;
    const nameLink = t.querySelector('[data-testid="User-Name"] a[href^="/"]');
    const nameHref = nameLink ? nameLink.getAttribute("href") : null;
    const author = (nameHref ? nameHref.split("/")[1] : null) || handle || undefined;
    const time = t.querySelector("time[datetime]");
    const publishedAt = time ? time.getAttribute("datetime") : undefined;
    out.push({ site: "x", kind: "post", text: text.slice(0, 800), url, author, publishedAt });
  }
  return out;
}
function domFacebook(handle) {
  const out = [];
  for (const art of document.querySelectorAll('div[role="article"]')) {
    const text = clean(art.innerText).slice(0, 1000);
    if (text.length < 25) continue;
    let url = null;
    for (const a of art.querySelectorAll("a[href]")) {
      const h = a.getAttribute("href") || "";
      if (/\/(posts|permalink|videos|reel)\/|pfbid|story_fbid/.test(h)) { url = abs(h); break; }
    }
    if (!url) continue;
    const authorLink = art.querySelector("h3 a, h2 a, strong a");
    let author = handle || undefined;
    if (authorLink) {
      const linkText = clean(authorLink.innerText || authorLink.textContent);
      const authorHref = abs(authorLink.getAttribute("href") || "") || "";
      const slugMatch = authorHref.match(FB_AUTHOR_SLUG);
      author = (slugMatch && slugMatch[1]) || linkText || handle || undefined;
    }
    out.push({ site: "facebook", kind: "post", text: text.slice(0, 800), url, author });
  }
  return out;
}
function domTikTok(handle) {
  const out = [];
  for (const d of document.querySelectorAll('[data-e2e="search-card-desc"], [data-e2e="browse-video-desc"], [data-e2e="video-desc"]')) {
    const text = clean(d.innerText);
    if (text.length < 10) continue;
    const link = d.closest("div") && d.closest("div").querySelector('a[href*="/video/"]');
    const url = link ? abs(link.getAttribute("href")) : abs(location.href);
    if (!url || !/\/video\//.test(url)) continue;
    out.push({ site: "tiktok", kind: "post", text: text.slice(0, 800), url, author: handle || undefined });
  }
  return out;
}

// Orquestador → content: ejecutá esta unidad y devolveme datos + status.
chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "ig-collect") {
        const prof = await igProfile(msg.handle);
        if (!prof.user) return sendResponse({ ok: true, status: prof.status, body: prof.body, items: [] });
        const [feed, stories] = [
          await igFeed(prof.user.id, msg.handle, prof.user.followers),
          await igStories(prof.user.id, msg.handle, prof.user.followers),
        ];
        const worst = Math.max(prof.status, feed.status, stories.status);
        sendResponse({ ok: true, status: worst, body: feed.body || stories.body, items: [...feed.items, ...stories.items] });
      } else if (msg.type === "ig-search") {
        const r = await igFetch(`/api/v1/web/search/topsearch/?context=blended&query=${encodeURIComponent(msg.query)}`);
        sendResponse({ ok: true, status: r.status, body: r.body, json: r.json });
      } else if (msg.type === "dom-collect") {
        // msg.query es solo informativo (lo usa el orquestador para armar candidatos);
        // el autor siempre sale del DOM. Scroll corto antes de leer para cargar más.
        window.scrollBy(0, 1200);
        await new Promise((r) => setTimeout(r, 1500));
        const h = location.hostname;
        let items = [];
        if (h.includes("facebook.com")) items = domFacebook(msg.handle);
        else if (h.includes("tiktok.com")) items = domTikTok(msg.handle);
        else if (h === "x.com" || h.includes("twitter.com")) items = domX(msg.handle);
        const seen = new Set();
        sendResponse({ ok: true, status: 200, items: items.filter((i) => i.url && !seen.has(i.url) && seen.add(i.url)) });
      } else {
        sendResponse({ ok: false, error: "tipo desconocido" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
  })();
  return true; // async
});
