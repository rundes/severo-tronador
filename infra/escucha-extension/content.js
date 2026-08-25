// Captura de menciones visibles en FB / IG / X / TikTok. Corre a pedido
// (mensaje "capture" desde el popup): extrae los posts renderizados en el
// DOM, los normaliza y los manda al background para subir al tablero.

function clean(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}
function abs(href) {
  try { return new URL(href, location.href).toString(); } catch { return null; }
}

function extractFacebook() {
  const out = [];
  for (const art of document.querySelectorAll('div[role="article"]')) {
    const label = art.getAttribute("aria-label") || "";
    const isComment = /omentario|omment/.test(label);
    const text = clean(art.innerText).slice(0, 1200);
    if (text.length < 25) continue;
    let url = null;
    for (const a of art.querySelectorAll("a[href]")) {
      const h = a.getAttribute("href") || "";
      if (/\/(posts|permalink|videos|reel)\/|pfbid|story_fbid|comment_id/.test(h)) {
        url = abs(h);
        break;
      }
    }
    if (!url) continue;
    out.push({ site: "facebook", text: text.slice(0, 800), url, kind: isComment ? "comment" : "post" });
  }
  return out;
}

function extractX() {
  const out = [];
  for (const t of document.querySelectorAll('article[data-testid="tweet"]')) {
    const text = clean(t.querySelector('[data-testid="tweetText"]')?.innerText);
    if (text.length < 10) continue;
    const link = t.querySelector('a[href*="/status/"]');
    const url = link ? abs(link.getAttribute("href")) : null;
    if (!url) continue;
    const author = clean(t.querySelector('[data-testid="User-Name"]')?.innerText)
      .split("\n")[0].slice(0, 80);
    out.push({ site: "x", text: text.slice(0, 800), url, author, kind: "post" });
  }
  return out;
}

function extractInstagram() {
  const out = [];
  for (const art of document.querySelectorAll("article")) {
    const link = art.querySelector('a[href*="/p/"], a[href*="/reel/"]');
    const url = link ? abs(link.getAttribute("href")) : abs(location.pathname);
    const text = clean(art.innerText).slice(0, 1200);
    if (!url || text.length < 20) continue;
    out.push({ site: "instagram", text: text.slice(0, 800), url, kind: "post" });
  }
  if (out.length === 0 && /\/(p|reel)\//.test(location.pathname)) {
    const text = clean(document.querySelector("h1")?.innerText);
    if (text.length >= 20) {
      out.push({ site: "instagram", text: text.slice(0, 800), url: abs(location.pathname), kind: "post" });
    }
  }
  return out;
}

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

function extractTikTok() {
  const out = [];
  for (const d of document.querySelectorAll('[data-e2e="search-card-desc"], [data-e2e="browse-video-desc"], [data-e2e="video-desc"]')) {
    const text = clean(d.innerText);
    if (text.length < 15) continue;
    const container = d.closest("div");
    const link = container?.querySelector('a[href*="/video/"]') ||
      d.closest('a[href*="/video/"]') ||
      document.querySelector('a[href*="/video/"]');
    const url = link ? abs(link.getAttribute("href")) : abs(location.href);
    if (!url || !/\/video\//.test(url)) continue;
    out.push({ site: "tiktok", text: text.slice(0, 800), url, kind: "post" });
  }
  for (const c of document.querySelectorAll('[data-e2e="comment-item"], [data-e2e="comment-level-1"]')) {
    const text = clean(c.querySelector('[data-e2e="comment-text"], p')?.innerText || c.innerText);
    if (text.length < 10) continue;
    const parent = abs(location.href);
    if (!/\/video\//.test(parent || "")) continue;
    out.push({
      site: "tiktok",
      text: text.slice(0, 800),
      url: `${parent}#c-${Math.abs(hashCode(text)) % 1e10}`,
      kind: "comment",
      parentUrl: parent,
    });
  }
  return out;
}

function extract() {
  const h = location.hostname;
  let items = [];
  if (h.includes("facebook.com")) items = extractFacebook();
  else if (h.includes("instagram.com")) items = extractInstagram();
  else if (h.includes("tiktok.com")) items = extractTikTok();
  else if (h === "x.com" || h.includes("twitter.com")) items = extractX();
  const seen = new Set();
  return items.filter((i) => i.url && !seen.has(i.url) && seen.add(i.url));
}

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (msg.type === "capture") {
    sendResponse({ items: extract() });
  }
  return false;
});
