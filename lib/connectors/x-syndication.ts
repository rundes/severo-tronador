// Lectura GRATIS de timelines públicos de X, sin login ni API paga, vía el
// endpoint de sindicación/embed (el que usa el widget oficial):
//   GET syndication.twitter.com/srv/timeline-profile/screen-name/<handle>
// Devuelve ~20 últimas publicaciones del handle en un <script __NEXT_DATA__>.
// Limitaciones: solo cuentas públicas activas (las chicas devuelven vacío),
// ~20 tweets, sin búsqueda por keyword, endpoint no documentado (X puede
// cortarlo). Best-effort + parse defensivo.
import type { ListenItem } from "./types";
import { log } from "@/lib/logger";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TIMEOUT_MS = 8000;
const MAX_HANDLES = 25; // cota para no exceder el tiempo de la función serverless

interface SynTweet {
  id_str?: string;
  full_text?: string;
  text?: string;
  created_at?: string;
  permalink?: string;
  user?: { screen_name?: string };
}

function permalinkUrl(permalink: string | undefined, handle: string): string {
  if (!permalink) return `https://x.com/${handle}`;
  if (/^https?:\/\//i.test(permalink)) return permalink;
  return `https://x.com${permalink.startsWith("/") ? "" : "/"}${permalink}`;
}

async function fetchOne(handleRaw: string): Promise<ListenItem[]> {
  const handle = handleRaw.replace(/^@/, "").trim();
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://syndication.twitter.com/srv/timeline-profile/screen-name/${handle}`,
      { signal: ctrl.signal, headers: { "user-agent": UA, accept: "text/html" } },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const m = html.match(
      /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
    );
    if (!m) return [];
    const data = JSON.parse(m[1]) as {
      props?: { pageProps?: { timeline?: { entries?: unknown[] } } };
    };
    const entries = data?.props?.pageProps?.timeline?.entries ?? [];
    const items: ListenItem[] = [];
    for (const e of entries) {
      const tw = (e as { content?: { tweet?: SynTweet } })?.content?.tweet;
      const text = tw?.full_text ?? tw?.text;
      if (!tw || !text) continue;
      items.push({
        source: "x-api",
        text,
        url: permalinkUrl(tw.permalink, handle),
        publishedAt: tw.created_at,
        author: tw.user?.screen_name ?? handle,
      });
    }
    return items;
  } finally {
    clearTimeout(timer);
  }
}

// Trae las últimas publicaciones de cada handle (cota MAX_HANDLES). Best-effort:
// los handles que fallan o están vacíos se ignoran.
export async function fetchXSyndication(handles: string[]): Promise<ListenItem[]> {
  const list = handles.slice(0, MAX_HANDLES);
  if (list.length === 0) return [];
  const results = await Promise.allSettled(list.map(fetchOne));
  const out: ListenItem[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") out.push(...r.value);
    else
      log.warn("listening.x_syndication.failed", {
        handle: list[i],
        error: String(r.reason),
      });
  });
  return out;
}
