// Mapeo puro de las respuestas de la API interna de Instagram a items del
// contrato de /api/extension/items. Recibe JSON ya parseado: no hace fetch,
// no toca chrome.*, no depende de la pestaña. Testeable con vitest.

const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
const MAX_TEXT = 800;

const toIso = (sec) =>
  typeof sec === "number" && Number.isFinite(sec) && sec > 0
    ? new Date(sec * 1000).toISOString()
    : undefined;

const numOrUndef = (v) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;

export function mediaUrl(pk, code) {
  return code
    ? `https://www.instagram.com/p/${code}/`
    : `https://www.instagram.com/media/${pk}/`;
}

// userId del primer item del feed: la vía barata que reemplaza a
// web_profile_info (que devuelve 400 desde el 26-ago).
export function userIdFromFeed(json) {
  const items = Array.isArray(json && json.items) ? json.items : [];
  for (const it of items) {
    const u = it && it.user;
    const pk = u && (u.pk || u.pk_id || u.id);
    if (pk) return String(pk);
  }
  return null;
}

// Fallback cuando el feed viene vacío: los scripts del perfil traen profile_id.
export function userIdFromScripts(doc) {
  if (!doc || typeof doc.querySelectorAll !== "function") return null;
  for (const s of doc.querySelectorAll("script")) {
    const m = String(s.textContent || "").match(/"profile_id"\s*:\s*"?(\d{3,})"?/);
    if (m) return m[1];
  }
  return null;
}

// Piezas nuevas del feed. Filtra por `taken_at` posterior a `sinceIso`, NUNCA
// por posición: los fijados van primero y son viejos. Devuelve también
// `pieces` (pk + url + comentarios) para que el sw pida los comentarios.
export function itemsFromFeed(json, handle, followers, sinceIso) {
  const raw = Array.isArray(json && json.items) ? json.items : [];
  const sinceMs = sinceIso ? +new Date(sinceIso) : NaN;
  const items = [];
  const pieces = [];
  for (const it of raw) {
    if (!it || (it.pk == null && !it.code)) continue;
    const takenAt = toIso(it.taken_at);
    if (takenAt && Number.isFinite(sinceMs) && +new Date(takenAt) <= sinceMs) continue;
    const url = mediaUrl(it.pk, it.code);
    const commentCount = numOrUndef(it.comment_count);
    items.push({
      site: "instagram",
      kind: it.media_type === 2 ? "reel" : "post",
      text: (clean(it.caption && it.caption.text) || "(publicación sin texto)").slice(0, MAX_TEXT),
      url,
      author: handle,
      publishedAt: takenAt,
      metrics: {
        followers: numOrUndef(followers),
        likeCount: numOrUndef(it.like_count),
        commentCount,
        viewCount: numOrUndef(it.play_count) ?? numOrUndef(it.view_count) ?? numOrUndef(it.ig_play_count),
        takenAt,
      },
    });
    pieces.push({ pk: String(it.pk), url, commentCount: commentCount ?? 0 });
  }
  return { items, pieces };
}

// Comentarios de una pieza. `handle` es la cuenta dueña: sus propias
// respuestas no cuentan como comentaristas para la densidad, se descartan.
export function commentsFromJson(json, parentUrl, handle) {
  const raw = Array.isArray(json && json.comments) ? json.comments : [];
  const own = String(handle || "").replace(/^@/, "").toLowerCase();
  const items = [];
  for (const c of raw) {
    if (!c) continue;
    const text = clean(c.text);
    const author = c.user && typeof c.user.username === "string" ? c.user.username : null;
    if (!text || !author) continue;
    if (own && author.toLowerCase() === own) continue;
    const pk = c.pk != null ? String(c.pk) : String(items.length + 1);
    items.push({
      site: "instagram",
      kind: "comment",
      text: text.slice(0, MAX_TEXT),
      url: `${parentUrl}#c${pk}`,
      author,
      parentUrl,
      publishedAt: toIso(c.created_at),
      metrics: { likeCount: numOrUndef(c.comment_like_count) },
    });
  }
  return items;
}

export function nextMinId(json) {
  const v = json && json.next_min_id;
  return typeof v === "string" && v ? v : null;
}

// Historias vigentes (reels_media). Lectura pura: nunca media/<pk>/seen.
export function storiesFromReels(json, handle, followers) {
  const reel = (Array.isArray(json && json.reels_media) ? json.reels_media : [])[0];
  const raw = Array.isArray(reel && reel.items) ? reel.items : [];
  return raw.filter(Boolean).map((it) => {
    const takenAt = toIso(it.taken_at);
    return {
      site: "instagram",
      kind: "story",
      text: (clean(it.accessibility_caption) || "(historia sin texto alternativo)").slice(0, MAX_TEXT),
      url: `https://www.instagram.com/stories/${handle}/${it.pk}/`,
      author: handle,
      publishedAt: takenAt,
      metrics: {
        followers: numOrUndef(followers),
        takenAt,
        expiringAt: toIso(it.expiring_at),
      },
    };
  });
}
