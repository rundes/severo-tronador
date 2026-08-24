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

// GDELT rechaza con 429 más de 1 request cada 5 s por IP ("Please limit
// requests to one every 5 seconds"). El cron listening-pull recorre todos los
// proyectos en serie dentro del mismo proceso, así que se serializan acá las
// llamadas con una pausa mínima entre ellas y se reintenta UNA vez el 429.
export const GDELT_MIN_GAP_MS = 5500;
const GDELT_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 2;

let lastCallAt = -Infinity;
let queue: Promise<unknown> = Promise.resolve();

export function __resetGdeltThrottle(): void {
  lastCallAt = -Infinity;
  queue = Promise.resolve();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Encola `fn` detrás de la llamada anterior y garantiza GDELT_MIN_GAP_MS
// desde el inicio de la última request.
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCallAt + GDELT_MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

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
  const url = `${ENDPOINT}?${params}`;
  // GDELT tarda 10-25 s en responder una query OR de 7 términos (medido
  // 2026-08-24: 21 s con 250 registros). Con el default de 8 s el fetch
  // abortaba siempre ("This operation was aborted") y el conector quedaba mudo.
  const doFetch = () => fetchWithTimeout(url, { timeoutMs: GDELT_TIMEOUT_MS });
  let res = await throttled(doFetch);
  for (let attempt = 1; res.status === 429 && attempt < MAX_ATTEMPTS; attempt++) {
    log.warn("listening.gdelt.rate_limited", { attempt });
    res = await throttled(doFetch);
  }
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
      const error = (e as Error).message;
      log.warn("listening.gdelt.fetch_failed", { error });
      // Sin esto el cron reporta "fetched: 0, errors: []" y nadie ve el 429.
      query.diagnostics?.push({ source: "gdelt", detail: error });
      if (!demoData()) return [];
      return mockListenItems("gdelt").filter((i) => matches(i, query));
    }
  },
};
