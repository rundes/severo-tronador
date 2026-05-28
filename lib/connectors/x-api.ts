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

const ID = "x-api";
const FREE_LIMIT = 1500;
const ENDPOINT = "https://api.x.com/2/tweets/search/recent";
const MAX_RESULTS = 20;

interface XTweet {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
}

interface XResp {
  data?: XTweet[];
}

function matches(item: ListenItem, q: ListenQuery): boolean {
  if (!q.keywords.length) return true;
  const t = item.text.toLowerCase();
  return q.keywords.some((k) => t.includes(k.toLowerCase()));
}

async function fetchReal(
  query: ListenQuery,
  bearer: string,
): Promise<ListenItem[]> {
  const params = new URLSearchParams({
    query: query.keywords.length ? query.keywords.join(" OR ") : "*",
    max_results: String(MAX_RESULTS),
    "tweet.fields": "created_at,author_id",
  });
  const res = await fetch(`${ENDPOINT}?${params}`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  if (!res.ok) throw new Error(`X API HTTP ${res.status}`);
  const json = (await res.json()) as XResp;
  await incrementUsage(ID, json.data?.length ?? 0);
  return (json.data ?? []).map((t) => ({
    source: "x.com",
    text: t.text,
    url: `https://x.com/i/web/status/${t.id}`,
    publishedAt: t.created_at,
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
      const real = await fetchReal(query, cfg.X_API_BEARER_TOKEN);
      log.debug("listening.x_api.fetch", { count: real.length });
      return real.filter((i) => matches(i, query));
    } catch (e) {
      log.warn("listening.x_api.fallback_mock", {
        error: (e as Error).message,
      });
      return mockListenItems("x-api").filter((i) => matches(i, query));
    }
  },
};
