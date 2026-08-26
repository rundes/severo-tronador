// infra/escucha-extension/core/nav.js
// Lógica pura del barrido (sin chrome.*): URLs de perfil/búsqueda y parseo
// de candidatos a actor. Testeable con vitest desde tests/.

const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
export const normHandle = (h) => clean(h).replace(/^@/, "").toLowerCase();

export function profileUrl(platform, handle) {
  const h = clean(handle).replace(/^@/, "");
  switch (platform) {
    case "x": return `https://x.com/${h}`;
    case "facebook": return `https://www.facebook.com/${h}`;
    case "tiktok": return `https://www.tiktok.com/@${h}`;
    case "instagram": return `https://www.instagram.com/${h}/`;
    default: return null;
  }
}

// Instagram y TikTok no se buscan por URL (IG va por API; TikTok fuera de alcance).
export function searchUrl(platform, query) {
  const q = encodeURIComponent(clean(query));
  switch (platform) {
    case "x": return `https://x.com/search?q=${q}&src=typed_query&f=live`;
    case "facebook": return `https://www.facebook.com/search/posts?q=${q}`;
    default: return null;
  }
}

export function candidatesFromIgSearch(json, query) {
  const users = (json && json.users) || [];
  return users
    .map((u) => u.user || u)
    .filter((u) => u && u.username)
    .map((u) => ({
      platform: "instagram",
      handle: normHandle(u.username),
      displayName: clean(u.full_name) || undefined,
      followers: typeof u.follower_count === "number" ? u.follower_count : undefined,
      sample: [],
      query,
    }));
}

export function candidatesFromItems(items, query) {
  const by = new Map();
  for (const it of items) {
    const handle = normHandle(it.author);
    if (!handle) continue;
    const key = `${it.site}:${handle}`;
    const c = by.get(key) || { platform: it.site, handle, sample: [], query };
    if (c.sample.length < 3) c.sample.push({ url: it.url, text: clean(it.text).slice(0, 500), at: it.publishedAt });
    by.set(key, c);
  }
  return [...by.values()];
}

export function mergeCandidates(lists) {
  const by = new Map();
  for (const list of lists) {
    for (const c of list) {
      const key = `${c.platform}:${normHandle(c.handle)}`;
      const cur = by.get(key);
      if (!cur) { by.set(key, { ...c, handle: normHandle(c.handle), sample: [...(c.sample || [])] }); continue; }
      cur.displayName = cur.displayName || c.displayName;
      cur.followers = cur.followers ?? c.followers;
      cur.bio = cur.bio || c.bio;
      for (const s of c.sample || []) if (cur.sample.length < 3 && !cur.sample.some((x) => x.url === s.url)) cur.sample.push(s);
    }
  }
  return [...by.values()];
}
