// Conector de listening: GDELT (prensa mundial geo-codificada, gratis).
// API DOC 2.0 sin auth. Si el fetch real falla cae al mock para no romper
// /escucha.
//
// Endpoint: https://api.gdeltproject.org/api/v2/doc/doc
//   query=...&format=json&maxrecords=N&sourcecountry=XX&timespan=24h
import type {
  ConnectorStatus,
  ListenItem,
  ListenQuery,
  ListeningConnector,
  TestResult,
} from "./types";
import { mockListenItems } from "@/lib/mock/listening";
import { demoData } from "@/lib/connectors/demo";
import { log } from "@/lib/logger";
import { fetchWithTimeout } from "@/lib/net/safe-fetch";

const ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";
const MAX_RECORDS = 250;

interface GdeltArticle {
  title?: string;
  url?: string;
  seendate?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
}

interface GdeltResp {
  articles?: GdeltArticle[];
}

function matches(item: ListenItem, q: ListenQuery): boolean {
  if (!q.keywords.length) return true;
  const t = item.text.toLowerCase();
  return q.keywords.some((k) => t.includes(k.toLowerCase()));
}

async function fetchReal(query: ListenQuery): Promise<ListenItem[]> {
  // GDELT exige términos concretos ("*" no es válido) y frases multi-palabra
  // entre comillas; sin eso devuelve una página HTML de error con status 200.
  const terms = query.keywords.length
    ? query.keywords
    : query.zona
      ? [query.zona]
      : [];
  if (terms.length === 0) return [];
  const joined = terms
    .map((t) => (/\s/.test(t.trim()) ? `"${t.trim()}"` : t.trim()))
    .join(" OR ");
  const q = terms.length > 1 ? `(${joined})` : joined;
  const params = new URLSearchParams({
    query: query.pais?.toLowerCase() === "ar" ? `${q} sourcelang:spa` : q,
    format: "json",
    maxrecords: String(MAX_RECORDS),
    timespan: "24h",
  });
  if (query.pais) params.set("sourcecountry", query.pais.toLowerCase());
  const res = await fetchWithTimeout(`${ENDPOINT}?${params}`);
  if (!res.ok) throw new Error(`GDELT HTTP ${res.status}`);
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("json")) {
    // Errores de query llegan como HTML con 200; sin este guard el .json()
    // tira y el fallback silencioso deja el conector mudo sin diagnóstico.
    const body = (await res.text()).slice(0, 200);
    throw new Error(`GDELT respuesta no-JSON (${ct}): ${body}`);
  }
  const json = (await res.json()) as GdeltResp;
  return (json.articles ?? []).map((a) => ({
    source: a.domain ?? "gdelt",
    text: a.title ?? "",
    url: a.url,
    publishedAt: a.seendate,
    author: a.domain,
  }));
}

export const gdeltConnector: ListeningConnector = {
  id: "gdelt",
  name: "GDELT",
  vendor: "The GDELT Project",
  category: "listening",
  description: "Prensa online geo-filtrada (gratis, sin API key).",
  docsUrl: "https://www.gdeltproject.org/",
  iconEmoji: "📰",
  capabilities: [
    { id: "news.fetch_geo", label: "Noticias por geo" },
    { id: "news.fetch_topic", label: "Noticias por tema" },
  ],
  configSchema: [],

  async test(): Promise<TestResult> {
    return { ok: true, message: "Sin auth — fetch real activo." };
  },
  async getStatus(): Promise<ConnectorStatus> {
    return "enabled";
  },
  async fetch(query: ListenQuery): Promise<ListenItem[]> {
    try {
      // Sin re-filtro local: la query de GDELT ya restringe por keyword, y el
      // match por substring pierde items por acentos ("Maipú" vs "Maipu").
      const real = await fetchReal(query);
      log.debug("listening.gdelt.fetch", { count: real.length });
      return real;
    } catch (e) {
      log.warn("listening.gdelt.fetch_failed", {
        error: (e as Error).message,
      });
      if (!demoData()) return [];
      return mockListenItems("gdelt").filter((i) => matches(i, query));
    }
  },
};
