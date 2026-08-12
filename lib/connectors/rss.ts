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
// Notas a enriquecer por tick en el fallback de scraping (fetch de cada nota
// para sacar descripción y fecha). Cap para no multiplicar fetches por sitio.
const ENRICH_MAX = 10;

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

// Feeds de Google News RSS generados desde la config de escucha: uno por la
// zona sola y uno por cada keyword acotada a la zona (máx 6 feeds). Formato:
// https://news.google.com/rss/search?q=...&hl=es-419&gl=AR&ceid=AR:es-419
export function googleNewsFeeds(q: ListenQuery): string[] {
  const zona = q.zona?.trim();
  const keywords = q.keywords.map((k) => k.trim()).filter(Boolean);
  const queries: string[] = [];
  if (zona) queries.push(`"${zona}"`);
  for (const k of keywords.slice(0, 5)) {
    queries.push(zona ? `"${zona}" ${k}` : k);
  }
  const gl = (q.pais ?? "AR").toUpperCase();
  return queries.map(
    (s) =>
      `https://news.google.com/rss/search?q=${encodeURIComponent(
        `${s} when:2d`,
      )}&hl=es-419&gl=${gl}&ceid=${gl}:es-419`,
  );
}

// ¿El body parece un feed RSS/Atom/RDF (y no una página HTML)?
export function looksLikeFeed(body: string): boolean {
  const head = body.slice(0, 2000);
  return /<(rss|feed|rdf:RDF)[\s>]/i.test(head) && !/<html[\s>]/i.test(head);
}

// Autodiscovery de feed: busca <link rel="alternate" type="application/rss+xml">
// (o atom) en el <head> del HTML. Orden de atributos libre.
export function discoverFeedUrl(html: string, baseUrl: string): string | null {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  for (const l of links) {
    if (!/rel=["']?alternate["']?/i.test(l)) continue;
    if (!/type=["']?application\/(rss|atom)\+xml/i.test(l)) continue;
    const href = l.match(/href=["']([^"']+)["']/i);
    if (href) {
      try {
        return new URL(href[1], baseUrl).toString();
      } catch {
        continue;
      }
    }
  }
  return null;
}

// Último recurso para sitios sin RSS: deriva items del HTML del home.
// Heurística: links same-host con texto largo (títulos de nota) y path
// profundo, excluyendo navegación/secciones. Sin fecha — el dedupe por
// (project_id, url) del cache evita repetidos entre ticks.
const SCRAPE_EXCLUDE =
  /\/(tag|tags|categoria|category|autor|author|seccion|login|suscri|contacto|publicidad|quienes|terminos|privacidad)\b/i;

export function scrapeHomeLinks(html: string, baseUrl: string): ListenItem[] {
  const host = hostOf(baseUrl);
  const clean = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");
  const seen = new Set<string>();
  const out: ListenItem[] = [];
  for (const m of clean.matchAll(
    /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const title = decodeEntities(m[2]);
    if (title.length < 30) continue; // navegación / botones
    let abs: URL;
    try {
      abs = new URL(m[1], baseUrl);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(abs.protocol)) continue;
    if (hostOf(abs.toString()) !== host) continue;
    if (abs.pathname.length < 10 || SCRAPE_EXCLUDE.test(abs.pathname)) continue;
    const url = abs.toString();
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ source: host, text: title.slice(0, 400), url, author: host });
    if (out.length >= 20) break;
  }
  return out;
}

// Fetch con anti-SSRF: valida el host en cada hop y sigue redirects a mano
// (redirect:"manual") re-validando el Location, para que un 302 no salte a una
// IP interna. Devuelve el body y la URL final.
async function fetchBody(url: string): Promise<{ body: string; finalUrl: string }> {
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
      return { body: await res.text(), finalUrl: current };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("demasiados redirects");
}

// Acepta tanto URLs de feed como URLs de sitio: si el body es HTML intenta
// autodiscovery (<link rel=alternate>), después rutas comunes (/feed — la
// enorme mayoría de los medios locales son WordPress y lo exponen aunque no
// lo publiquen), y como último recurso deriva items scrapeando el home.
async function fetchFeed(url: string): Promise<ListenItem[]> {
  const { body, finalUrl } = await fetchBody(url);
  if (looksLikeFeed(body)) return parseFeed(body, finalUrl);

  const candidates: string[] = [];
  const discovered = discoverFeedUrl(body, finalUrl);
  if (discovered) candidates.push(discovered);
  for (const p of ["/feed", "/rss.xml"]) {
    try {
      const c = new URL(p, finalUrl).toString();
      if (!candidates.includes(c)) candidates.push(c);
    } catch {
      // URL base inválida: seguimos con lo que haya
    }
  }
  for (const c of candidates) {
    try {
      const r = await fetchBody(c);
      if (looksLikeFeed(r.body)) {
        log.info("listening.rss.feed_derived", { site: url, feed: c });
        return parseFeed(r.body, r.finalUrl);
      }
    } catch {
      // candidato muerto: probar el siguiente
    }
  }

  const scraped = scrapeHomeLinks(body, finalUrl);
  log.info("listening.rss.home_scraped", { site: url, items: scraped.length });
  return enrichScraped(scraped);
}

// Metadata de una nota: og:description / description, og:title y fecha de
// publicación. Los sitios sin RSS igual llevan Open Graph casi siempre.
export function extractArticleMeta(html: string): {
  description?: string;
  title?: string;
  publishedAt?: string;
} {
  const head = html.slice(0, 20000);
  const meta = (names: string[]): string | undefined => {
    for (const n of names) {
      const tag = head.match(
        new RegExp(`<meta\\b[^>]*(?:property|name)=["']${n}["'][^>]*>`, "i"),
      )?.[0];
      const c = tag?.match(/content=["']([^"']+)["']/i);
      if (c?.[1]) return decodeEntities(c[1]);
    }
    return undefined;
  };
  return {
    description: meta(["og:description", "twitter:description", "description"]),
    title: meta(["og:title"]),
    publishedAt: meta(["article:published_time", "og:article:published_time"]),
  };
}

// Visita cada nota scrapeada (hasta ENRICH_MAX) y completa el item con
// "título — descripción" + publishedAt, en el mismo formato que el path RSS.
// Un fetch fallido deja el item como estaba; el resto pasa sin enriquecer.
async function enrichScraped(items: ListenItem[]): Promise<ListenItem[]> {
  const targets = items.slice(0, ENRICH_MAX);
  const rest = items.slice(ENRICH_MAX);
  const results = await Promise.allSettled(
    targets.map(async (it) => {
      if (!it.url) return it;
      const { body } = await fetchBody(it.url);
      const m = extractArticleMeta(body);
      const title = m.title && m.title.length >= 15 ? m.title : it.text;
      const text =
        m.description && m.description.length > 40
          ? `${title} — ${m.description}`.slice(0, 400)
          : title.slice(0, 400);
      return { ...it, text, publishedAt: m.publishedAt ?? it.publishedAt };
    }),
  );
  const enriched = results.map((r, i) =>
    r.status === "fulfilled" ? r.value : targets[i],
  );
  return [...enriched, ...rest];
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
    const configured = (query.rssFeeds ?? [])
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u))
      .slice(0, 40);
    // Sin feeds configurados: fallback a Google News RSS armado desde
    // zona + keywords. Cubre prensa local sin depender de que cada medio
    // mantenga su feed. Los items ya vienen filtrados por la búsqueda,
    // así que no se re-filtra por keyword (evita perder por acentos).
    const auto = configured.length === 0;
    const feeds = auto ? googleNewsFeeds(query) : configured;
    if (feeds.length === 0) return [];
    const results = await Promise.allSettled(feeds.map(fetchFeed));
    const items: ListenItem[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") items.push(...r.value);
      else log.warn("listening.rss.feed_failed", { feed: feeds[i], error: String(r.reason) });
    });
    if (auto) {
      log.info("listening.rss.google_news_fallback", {
        feeds: feeds.length,
        items: items.length,
      });
      return items;
    }
    return items.filter((i) => matches(i, query));
  },
};
