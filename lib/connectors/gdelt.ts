// Conector de listening: GDELT (prensa mundial geo-codificada, gratis).
// F8: modo mock con prensa local genérica. Real: GDELT DOC 2.0 API.
import type {
  ConnectorStatus,
  ListenItem,
  ListenQuery,
  ListeningConnector,
  TestResult,
} from "./types";
import { mockListenItems } from "@/lib/mock/listening";

function matches(item: ListenItem, q: ListenQuery): boolean {
  if (!q.keywords.length) return true;
  const t = item.text.toLowerCase();
  return q.keywords.some((k) => t.includes(k.toLowerCase()));
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
    return { ok: true, message: "Modo mock — prensa local simulada." };
  },
  async getStatus(): Promise<ConnectorStatus> {
    return "enabled";
  },
  async fetch(query: ListenQuery): Promise<ListenItem[]> {
    return mockListenItems("gdelt").filter((i) => matches(i, query));
  },
};
