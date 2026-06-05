// Listening pasivo (F8): consolida los conectores de escucha, agrupa por tema
// (coding del conector de análisis) y detecta temas emergentes (volumen
// reciente >> baseline). Cierra la pipeline: listening descubre temas →
// encuestas miden prevalencia (ARCHITECTURE / VISION).
import { connectors } from "@/lib/connectors/registry";
import type { ListenItem, ListeningConnector, ListenQuery } from "@/lib/connectors/types";
import { claudeApiConnector, type CodingOutput } from "@/lib/connectors/claude-api";
import { getListeningConfig } from "@/lib/listening-config";
import { cacheHasFreshItems, readCachedItems } from "@/lib/listening-cache";
import {
  DEFAULT_EMERGENCE,
  detectEmerging,
  sortByEmergence,
  type TopicBreakdown,
} from "@/lib/emergence";
import {
  aggregateTagsBySentiment,
  classifySentiment,
  type Sentiment,
  type TagCount,
} from "@/lib/sentiment";

// Anclado al dataset mock (2026-05-26). El real usaría Date.now().
const NOW = Date.UTC(2026, 4, 26);

export interface Topic {
  label: string;
  recent: number;
  prior: number;
  emerging: boolean;
  examples: string[];
  // Plan 05 F6: breakdown por fuente (source). Permite ver dónde está
  // creciendo cada tema (ej "inseguridad" emerge en Meta CL pero no en
  // GDELT). bySource agrupa por item.source crudo (meta-ig, x-api, etc).
  bySource: Record<string, TopicBreakdown>;
}

export interface FeedItem {
  source: string;
  text: string;
  url?: string;
  author?: string;
  publishedAt?: string;
  sentiment: Sentiment;
  // Threading (Plan 05 F4): cuando un item es un comment Meta CL o reply
  // X, parentUrl referencia al post padre. La UI agrupa visualmente.
  kind?: "post" | "reel" | "comment" | "tweet" | "reply";
  parentUrl?: string;
}

export interface AuthorRanking {
  author: string;
  count: number;
  positive: number;
  negative: number;
  sentimentScore: number; // -1 (todo neg) .. +1 (todo pos)
}

export interface ListeningResult {
  totalItems: number;
  bySource: Record<string, number>;
  bySentiment: Record<Sentiment, number>;
  topics: Topic[];
  positiveTags: TagCount[];
  negativeTags: TagCount[];
  topPositive: AuthorRanking[];
  topNegative: AuthorRanking[];
  feed: FeedItem[];
}

export async function runListening(
  projectId: string,
): Promise<ListeningResult> {
  const cfg = await getListeningConfig(projectId);

  const listeners = (connectors.filter(
    (c) => c.category === "listening",
  ) as ListeningConnector[]).filter(
    (c) => cfg.fuentes.length === 0 || cfg.fuentes.includes(c.id),
  );

  const query: ListenQuery = {
    keywords: cfg.keywords,
    zona: cfg.zona || undefined,
    pais: cfg.pais || undefined,
    radioKm: cfg.radioKm,
    lat: cfg.lat,
    lng: cfg.lng,
    rssFeeds: cfg.rssFeeds,
  };

  // Cache-first (Plan 05 F5). Si listening_items tiene rows frescas las
  // leemos de DB en vez de pegarle a las APIs. El cron horario
  // /api/cron/listening-pull mantiene la cache caliente.
  let items: ListenItem[];
  if (await cacheHasFreshItems(projectId, 7)) {
    const enabledIds = cfg.fuentes.length > 0 ? cfg.fuentes : undefined;
    items = await readCachedItems(projectId, 14, enabledIds);
  } else {
    items = (await Promise.all(listeners.map((l) => l.fetch(query)))).flat();
  }

  const coding = (
    await claudeApiConnector.analyze(
      items.map((i) => i.text),
      "coding_qualitative",
    )
  ).output as CodingOutput;

  const topics: Topic[] = sortByEmergence(
    detectEmerging(
      coding.themes.map((t) => t.label),
      items,
      { ...DEFAULT_EMERGENCE, now: NOW },
    ),
  );

  const bySource: Record<string, number> = {};
  for (const i of items) bySource[i.source] = (bySource[i.source] ?? 0) + 1;

  // Sentiment per item + agregaciones.
  const enriched = items.map((i) => ({
    ...i,
    sentiment: classifySentiment(i.text).sentiment,
  }));
  const bySentiment: Record<Sentiment, number> = {
    positive: 0,
    negative: 0,
    neutral: 0,
  };
  for (const i of enriched) bySentiment[i.sentiment]++;

  const tagBuckets = aggregateTagsBySentiment(items);

  // Ranking de autores. Cada item con author contribuye a su score.
  const authorMap = new Map<string, { count: number; pos: number; neg: number }>();
  for (const i of enriched) {
    if (!i.author) continue;
    const cur = authorMap.get(i.author) ?? { count: 0, pos: 0, neg: 0 };
    cur.count++;
    if (i.sentiment === "positive") cur.pos++;
    else if (i.sentiment === "negative") cur.neg++;
    authorMap.set(i.author, cur);
  }
  const allAuthors: AuthorRanking[] = Array.from(authorMap.entries()).map(
    ([author, s]) => ({
      author,
      count: s.count,
      positive: s.pos,
      negative: s.neg,
      sentimentScore:
        s.count > 0 ? (s.pos - s.neg) / s.count : 0,
    }),
  );
  // Top 10 por positivo neto (sentimentScore × count, requiere ≥1 pos).
  const topPositive = allAuthors
    .filter((a) => a.positive > 0)
    .sort((a, b) => b.positive * b.sentimentScore - a.positive * a.sentimentScore)
    .slice(0, 10);
  const topNegative = allAuthors
    .filter((a) => a.negative > 0)
    .sort((a, b) => b.negative * -b.sentimentScore - a.negative * -a.sentimentScore)
    .slice(0, 10);

  // Feed: últimos 50 ordenados por publishedAt desc.
  const feed: FeedItem[] = enriched
    .slice()
    .sort((a, b) => {
      const ta = a.publishedAt ? +new Date(a.publishedAt) : 0;
      const tb = b.publishedAt ? +new Date(b.publishedAt) : 0;
      return tb - ta;
    })
    .slice(0, 50);

  return {
    totalItems: items.length,
    bySource,
    bySentiment,
    topics,
    positiveTags: tagBuckets.positive,
    negativeTags: tagBuckets.negative,
    topPositive,
    topNegative,
    feed,
  };
}
