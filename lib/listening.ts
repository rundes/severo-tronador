// Listening pasivo (F8): consolida los conectores de escucha, agrupa por tema
// (coding del conector de análisis) y detecta temas emergentes (volumen
// reciente >> baseline). Cierra la pipeline: listening descubre temas →
// encuestas miden prevalencia (ARCHITECTURE / VISION).
import { connectors } from "@/lib/connectors/registry";
import type { ListenItem, ListeningConnector } from "@/lib/connectors/types";
import { claudeApiConnector, type CodingOutput } from "@/lib/connectors/claude-api";

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

export interface ListeningResult {
  totalItems: number;
  bySource: Record<string, number>;
  topics: Topic[];
}

export async function runListening(
  keywords: string[] = [],
): Promise<ListeningResult> {
  const listeners = connectors.filter(
    (c) => c.category === "listening",
  ) as ListeningConnector[];

  const items: ListenItem[] = (
    await Promise.all(listeners.map((l) => l.fetch({ keywords })))
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

  return { totalItems: items.length, bySource, topics };
}
