// Conector de listening: RSS/Atom de medios locales (gratis, sin API key).
// Los feeds los edita el usuario en /escucha (listening_config.rss_feeds) y
// llegan acá vía query.rssFeeds. Parser mínimo sin dependencias: maneja RSS
// <item> y Atom <entry>. Por feed limita y corta por timeout para no colgar.
import { lookup } from "node:dns/promises";
import net from "node:net";
import type {
  ConnectorStatus,
  ListenItem,
  ListenQuery,
  ListeningConnector,
  TestResult,
} from "./types";
import { log } from "@/lib/logger";

const PER_FEED_MAX = 40;
const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

// Anti-SSRF: rechaza IPs privadas/loopback/link-local/metadata. Los feeds son
// URLs que carga el usuario → sin esto podrían apuntar a servicios internos.
function ipIsPrivate(ipRaw: string): boolean {
  let s = ipRaw.toLowerCase();
  if (s.startsWith("::ffff:")) s = s.slice(7); // IPv4 mapeada en IPv6
  if (net.isIPv4(s)) {
    const [a, b] = s.split(".").map(Number);
    if ([a, b].some((n) => Number.isNaN(n))) return true;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local + metadata cloud
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (s === "::1" || s === "::") return true;
  if (s.startsWith("fc") || s.startsWith("fd")) return true; // ULA fc00::/7
  if (s.startsWith("fe80")) return true; // link-local
  return false;
}

async function assertPublicHost(urlStr: string): Promise<void> {
  const u = new URL(urlStr);
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("esquema no permitido");
  }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error("host interno");
  }
  if (net.isIP(host)) {
    if (ipIsPrivate(host)) throw new Error("IP privada");
    return;
  }
  const addrs = await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => ipIsPrivate(a.address))) {
    throw new Error("resuelve a IP privada");
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ") // saca tags HTML embebidos
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function firstTag(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeEntities(m[1]) : undefined;
}

// Atom <link href="..."/> (puede haber varios; preferimos rel="alternate").
function atomLink(block: string): string | undefined {
  const links = [...block.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const alt = links.find((l) => /rel=["']?alternate/i.test(l)) ?? links[0];
  const href = alt?.match(/href=["']([^"']+)["']/i);
  return href?.[1];
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "rss";
  }
}

function parseFeed(xml: string, feedUrl: string): ListenItem[] {
  const host = hostOf(feedUrl);
  const out: ListenItem[] = [];

  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const block = m[0];
    const title = firstTag(block, "title");
    if (!title) continue;
    const desc = firstTag(block, "description");
    out.push({
      source: host,
      text: desc && desc.length > title.length ? `${title} — ${desc}`.slice(0, 400) : title,
      url: firstTag(block, "link"),
      publishedAt: firstTag(block, "pubDate") ?? firstTag(block, "dc:date"),
      author: host,
    });
    if (out.length >= PER_FEED_MAX) return out;
  }

  for (const m of xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)) {
    const block = m[0];
    const title = firstTag(block, "title");
    if (!title) continue;
    out.push({
      source: host,
      text: title,
      url: atomLink(block),
      publishedAt: firstTag(block, "updated") ?? firstTag(block, "published"),
      author: host,
    });
    if (out.length >= PER_FEED_MAX) return out;
  }

  return out;
}

function matches(item: ListenItem, q: ListenQuery): boolean {
  if (!q.keywords.length) return true;
  const t = item.text.toLowerCase();
  return q.keywords.some((k) => t.includes(k.toLowerCase()));
}

// Fetch con anti-SSRF: valida el host en cada hop y sigue redirects a mano
// (redirect:"manual") re-validando el Location, para que un 302 no salte a una
// IP interna.
async function fetchFeed(url: string): Promise<ListenItem[]> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(current);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(current, {
        signal: ctrl.signal,
        redirect: "manual",
        headers: { "user-agent": "severo-tronador-listening/1.0" },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) throw new Error(`redirect ${res.status} sin location`);
        current = new URL(loc, current).toString();
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseFeed(await res.text(), current);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("demasiados redirects");
}

export const rssConnector: ListeningConnector = {
  id: "rss-medios",
  name: "RSS medios locales",
  vendor: "Genérico",
  category: "listening",
  description: "Feeds RSS/Atom de medios configurados por el usuario (gratis).",
  docsUrl: "https://es.wikipedia.org/wiki/RSS",
  iconEmoji: "📡",
  capabilities: [{ id: "news.fetch_rss", label: "Noticias por RSS" }],
  configSchema: [],

  async test(): Promise<TestResult> {
    return { ok: true, message: "Sin auth — configurá feeds en Escucha." };
  },
  async getStatus(): Promise<ConnectorStatus> {
    return "enabled";
  },
  async fetch(query: ListenQuery): Promise<ListenItem[]> {
    const feeds = (query.rssFeeds ?? [])
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u))
      .slice(0, 40);
    if (feeds.length === 0) return [];
    const results = await Promise.allSettled(feeds.map(fetchFeed));
    const items: ListenItem[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") items.push(...r.value);
      else log.warn("listening.rss.feed_failed", { feed: feeds[i], error: String(r.reason) });
    });
    return items.filter((i) => matches(i, query));
  },
};
