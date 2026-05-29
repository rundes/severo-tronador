// Listening pasivo (F8): consolida los conectores de escucha, agrupa por tema
// (coding del conector de análisis) y detecta temas emergentes (volumen
// reciente >> baseline). Cierra la pipeline: listening descubre temas →
// encuestas miden prevalencia (ARCHITECTURE / VISION).
import { connectors } from "@/lib/connectors/registry";
import type { ListenItem, ListeningConnector, ListenQuery } from "@/lib/connectors/types";
import { claudeApiConnector, type CodingOutput } from "@/lib/connectors/claude-api";
import { getListeningConfig } from "@/lib/listening-config";
import {
  aggregateTagsBySentiment,
  classifySentiment,
  type Sentiment,
  type TagCount,
} from "@/lib/sentiment";

// Anclado al dataset mock (2026-05-26). El real usaría Date.now().
const NOW = Date.UTC(2026, 4, 26);
const DAY = 24 * 60 * 60 * 1000;
const WINDOW = 7 * DAY;

export interface Topic {
  label: string;
  recent: number; // últimos 7 días
  prior: number; // 7–14 días atrás (baseline)
  emerging: boolean; // recent >= 3× baseline
  examples: string[];
}

export interface FeedItem {
  source: string;
  text: string;
  url?: string;
  author?: string;
  publishedAt?: string;
  sentiment: Sentiment;
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

export async function runListening(): Promise<ListeningResult> {
  const cfg = await getListeningConfig();

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
  };

  const items: ListenItem[] = (
    await Promise.all(listeners.map((l) => l.fetch(query)))
  ).flat();

  const coding = (
    await claudeApiConnector.analyze(
      items.map((i) => i.text),
      "coding_qualitative",
    )
  ).output as CodingOutput;

  const topics: Topic[] = coding.themes
    .map((t) => {
      const withTheme = items.filter((i) =>
        i.text.toLowerCase().includes(t.label),
      );
      const age = (i: ListenItem) =>
        i.publishedAt ? NOW - +new Date(i.publishedAt) : Infinity;
      const recent = withTheme.filter((i) => age(i) <= WINDOW).length;
      const prior = withTheme.filter(
        (i) => age(i) > WINDOW && age(i) <= 2 * WINDOW,
      ).length;
      const emerging = recent >= 3 && (prior === 0 || recent / prior >= 3);
      return {
        label: t.label,
        recent,
        prior,
        emerging,
        examples: withTheme.slice(0, 2).map((i) => i.text),
      };
    })
    .sort((a, b) => Number(b.emerging) - Number(a.emerging) || b.recent - a.recent);

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
