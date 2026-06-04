// Conector de listening: X API (Basic Tier, 1.500 tweets/mes free).
// Con X_API_BEARER_TOKEN llama a /2/tweets/search/recent. Sin token → mock.
// Si el fetch real falla cae al mock para no romper /escucha.
import type {
  Config,
  ConnectorStatus,
  ListenItem,
  ListenQuery,
  ListeningConnector,
  Quota,
  TestResult,
} from "./types";
import { getUsage, incrementUsage, nextMonthlyReset } from "@/lib/quota";
import { mockListenItems } from "@/lib/mock/listening";
import { getConnectorConfig } from "./config";
import { log } from "@/lib/logger";
import { getMappedXHandles } from "@/lib/padron-handles";

const ID = "x-api";
// Free tier mensual, compartido entre la búsqueda y los timelines por handle.
export const X_FREE_LIMIT = 1500;
const FREE_LIMIT = X_FREE_LIMIT;
const ENDPOINT = "https://api.x.com/2/tweets/search/recent";
// Lookup de usuario (handle → id) y timeline de un usuario.
const USER_LOOKUP = "https://api.x.com/2/users/by/username";
const USER_TIMELINE = "https://api.x.com/2/users";
const MAX_RESULTS = 100;
// Posteos a traer por usuario en la escucha activa (pedido del producto).
export const POSTS_PER_USER = 5;

interface XTweet {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
}

interface XResp {
  data?: XTweet[];
}

export interface XUserRef {
  id: string;
  username: string;
}

// Resuelve un handle ("vecinacentro") a su id numérico + username canónico.
// El id se cachea en x_handle_queue para no repetir este lookup.
export async function resolveXUserId(
  handle: string,
  bearer: string,
): Promise<XUserRef> {
  const res = await fetch(`${USER_LOOKUP}/${encodeURIComponent(handle)}`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  if (!res.ok) throw new Error(`X API user lookup HTTP ${res.status}`);
  const json = (await res.json()) as { data?: { id: string; username: string } };
  if (!json.data?.id) throw new Error(`X API usuario '${handle}' no encontrado`);
  return { id: json.data.id, username: json.data.username };
}

// Mapea tweets crudos del timeline a ListenItem (kind "tweet", author = handle).
export function mapTimelineTweets(
  tweets: XTweet[],
  username: string,
): ListenItem[] {
  return tweets.map((t) => ({
    source: "x.com",
    text: t.text,
    url: `https://x.com/${username}/status/${t.id}`,
    publishedAt: t.created_at,
    author: username,
    kind: "tweet" as const,
  }));
}

// Trae los últimos `count` posteos de un usuario (timeline, no búsqueda):
// los más recientes sin importar la fecha. Excluye RTs y replies para
// quedarse con el contenido propio. La X API exige max_results >= 5.
export async function fetchXUserTimeline(
  authorId: string,
  username: string,
  bearer: string,
  count = POSTS_PER_USER,
): Promise<ListenItem[]> {
  const params = new URLSearchParams({
    max_results: String(Math.min(Math.max(count, 5), 100)),
    "tweet.fields": "created_at",
    exclude: "retweets,replies",
  });
  const res = await fetch(`${USER_TIMELINE}/${authorId}/tweets?${params}`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  if (!res.ok) throw new Error(`X API timeline HTTP ${res.status}`);
  const json = (await res.json()) as XResp;
  return mapTimelineTweets((json.data ?? []).slice(0, count), username);
}

function matches(item: ListenItem, q: ListenQuery): boolean {
  if (!q.keywords.length) return true;
  const t = item.text.toLowerCase();
  return q.keywords.some((k) => t.includes(k.toLowerCase()));
}

async function fetchReal(
  query: ListenQuery,
  bearer: string,
  handles: string[] = [],
): Promise<ListenItem[]> {
  // Combina keywords + geo + lang. point_radius requiere lat/lng/km.
  const keywordPart = query.keywords.length
    ? `(${query.keywords.join(" OR ")})`
    : "*";
  let q = `${keywordPart} lang:es -is:retweet`;
  // Si hay handles mapeados desde el padrón, los sumamos con OR para
  // traer también el contenido de esos usuarios. X query tiene techo
  // de 512 chars → recortamos si excede.
  if (handles.length > 0) {
    const fromClause = handles.map((h) => `from:${h}`).join(" OR ");
    const candidate = `${q} OR (${fromClause})`;
    q = candidate.length <= 512 ? candidate : q;
  }
  if (query.lat != null && query.lng != null) {
    const radio = query.radioKm ?? 25;
    q += ` point_radius:[${query.lng} ${query.lat} ${radio}km]`;
  } else if (query.pais) {
    q += ` place_country:${query.pais.toUpperCase()}`;
  }
  const params = new URLSearchParams({
    query: q,
    max_results: String(MAX_RESULTS),
    "tweet.fields": "created_at,author_id",
    expansions: "author_id",
    "user.fields": "username",
  });
  const res = await fetch(`${ENDPOINT}?${params}`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  if (!res.ok) throw new Error(`X API HTTP ${res.status}`);
  const json = (await res.json()) as XResp & {
    includes?: { users?: { id: string; username: string }[] };
  };
  await incrementUsage(ID, json.data?.length ?? 0);
  const usersById = new Map(
    (json.includes?.users ?? []).map((u) => [u.id, u.username]),
  );
  return (json.data ?? []).map((t) => ({
    source: "x.com",
    text: t.text,
    url: `https://x.com/i/web/status/${t.id}`,
    publishedAt: t.created_at,
    author: t.author_id ? usersById.get(t.author_id) ?? t.author_id : undefined,
  }));
}

export const xApiConnector: ListeningConnector = {
  id: ID,
  name: "X API (Basic)",
  vendor: "X Corp.",
  category: "listening",
  description: "Tweets con geo/keyword — 1.500/mes free.",
  docsUrl: "https://developer.x.com/en/docs/x-api",
  iconEmoji: "𝕏",
  capabilities: [
    { id: "tweets.search", label: "Buscar tweets" },
    { id: "tweets.geo_filter", label: "Filtro geo" },
  ],
  configSchema: [
    { key: "X_API_BEARER_TOKEN", label: "Bearer Token", type: "secret", required: true },
    {
      key: "X_TIMELINE_BATCH",
      label: "Handles por corrida (timeline)",
      type: "text",
      required: false,
      placeholder: "50",
      help: "Cuántos usuarios del padrón procesa cada corrida del cron de timelines. El tope mensual real lo pone el free tier (1.500 tweets); el resto queda en cola.",
    },
  ],

  async test(config?: Config): Promise<TestResult> {
    const cfg = config ?? await getConnectorConfig(ID);
    return cfg.X_API_BEARER_TOKEN
      ? { ok: true, message: "Token presente — búsqueda real activa." }
      : { ok: true, message: "Modo mock — tweets simulados." };
  },
  async getStatus(): Promise<ConnectorStatus> {
    return (await getUsage(ID)) >= FREE_LIMIT ? "quota_exhausted" : "enabled";
  },
  async getQuota(): Promise<Quota> {
    return {
      used: await getUsage(ID),
      limit: FREE_LIMIT,
      unit: "api_calls",
      period: "month",
      resetAt: nextMonthlyReset(),
    };
  },
  async fetch(query: ListenQuery): Promise<ListenItem[]> {
    const cfg = await getConnectorConfig(ID);
    if (!cfg.X_API_BEARER_TOKEN) {
      return mockListenItems("x-api").filter((i) => matches(i, query));
    }
    try {
      const handles = await getMappedXHandles();
      const real = await fetchReal(query, cfg.X_API_BEARER_TOKEN, handles);
      log.debug("listening.x_api.fetch", {
        count: real.length,
        handles: handles.length,
      });
      return real.filter((i) => matches(i, query));
    } catch (e) {
      log.warn("listening.x_api.fallback_mock", {
        error: (e as Error).message,
      });
      return mockListenItems("x-api").filter((i) => matches(i, query));
    }
  },
};
