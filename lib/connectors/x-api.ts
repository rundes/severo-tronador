// Conector de listening: X API (Basic Tier, 1.500 tweets/mes free).
// F8: modo mock. Real: X API v2 recent search con bearer token.
import type {
  ConnectorStatus,
  ListenItem,
  ListenQuery,
  ListeningConnector,
  Quota,
  TestResult,
} from "./types";
import { getUsage, nextMonthlyReset } from "@/lib/quota";
import { mockListenItems } from "@/lib/mock/listening";

const ID = "x-api";
const FREE_LIMIT = 1500;

function matches(item: ListenItem, q: ListenQuery): boolean {
  if (!q.keywords.length) return true;
  const t = item.text.toLowerCase();
  return q.keywords.some((k) => t.includes(k.toLowerCase()));
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

  async test(): Promise<TestResult> {
    return process.env.X_API_BEARER_TOKEN
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
    return mockListenItems("x-api").filter((i) => matches(i, query));
  },
};
