// Conector de listening: Reddit API (gratis). F8: modo mock con posts de
// subreddits regionales. Real: Reddit search API (OAuth app).
import type {
  ConnectorStatus,
  ListenItem,
  ListenQuery,
  ListeningConnector,
  TestResult,
} from "./types";
import { mockListenItems } from "@/lib/mock/listening";
import { demoData } from "@/lib/connectors/demo";

function matches(item: ListenItem, q: ListenQuery): boolean {
  if (!q.keywords.length) return true;
  const t = item.text.toLowerCase();
  return q.keywords.some((k) => t.includes(k.toLowerCase()));
}

export const redditApiConnector: ListeningConnector = {
  id: "reddit-api",
  name: "Reddit API",
  vendor: "Reddit, Inc.",
  category: "listening",
  description: "Posts de subreddits regionales (gratis).",
  docsUrl: "https://www.reddit.com/dev/api",
  iconEmoji: "👽",
  capabilities: [
    { id: "reddit.search_subreddit", label: "Buscar en subreddit" },
    { id: "reddit.search_keyword", label: "Buscar por keyword" },
  ],
  configSchema: [
    { key: "REDDIT_CLIENT_ID", label: "Client ID", type: "text", required: true },
    { key: "REDDIT_CLIENT_SECRET", label: "Client Secret", type: "secret", required: true },
  ],

  async test(): Promise<TestResult> {
    return { ok: true, message: "Modo mock — posts simulados." };
  },
  async getStatus(): Promise<ConnectorStatus> {
    return "enabled";
  },
  async fetch(query: ListenQuery): Promise<ListenItem[]> {
    if (!demoData()) return []; // sin impl real aún: en prod no inventa datos
    return mockListenItems("reddit-api").filter((i) => matches(i, query));
  },
};
