// Detección de temas emergentes (Plan 05 F6).
//
// Modelo: recent vs prior week (window configurable via env). Emerging =
// (a) volumen recent >= EMERGENCE_MIN_VOLUME (anti-ruido),
// (b) recent / prior >= EMERGENCE_RATIO o prior == 0 con recent >= min.
//
// Por-source breakdown: cada tema expone bySource para que la UI muestre
// dónde está creciendo (ej "inseguridad" emerging mayormente en Meta CL).
import type { ListenItem } from "@/lib/connectors/types";

export interface TopicBreakdown {
  recent: number;
  prior: number;
}

export interface EmergenceConfig {
  windowDays: number;
  minVolume: number;
  ratio: number;
  // ms anchor para "ahora". Permite tests reproducibles.
  now?: number;
}

export const DEFAULT_EMERGENCE: EmergenceConfig = {
  windowDays: Number(process.env.LISTENING_WINDOW_DAYS ?? 7),
  minVolume: Number(process.env.LISTENING_EMERGENCE_MIN ?? 3),
  ratio: Number(process.env.LISTENING_EMERGENCE_RATIO ?? 3),
};

export interface EmergingTopic {
  label: string;
  recent: number;
  prior: number;
  emerging: boolean;
  examples: string[];
  bySource: Record<string, TopicBreakdown>;
}

// Detecta emergencia para un set de labels (themes) sobre items. Cada
// label matchea por substring (lower-case) sobre item.text.
export function detectEmerging(
  labels: string[],
  items: ListenItem[],
  config: EmergenceConfig = DEFAULT_EMERGENCE,
): EmergingTopic[] {
  const now = config.now ?? Date.now();
  const windowMs = config.windowDays * 24 * 60 * 60 * 1000;
  const age = (i: ListenItem) =>
    i.publishedAt ? now - +new Date(i.publishedAt) : Infinity;

  return labels.map((label) => {
    const labelLc = label.toLowerCase();
    const withTheme = items.filter((i) =>
      i.text.toLowerCase().includes(labelLc),
    );
    const recentItems = withTheme.filter((i) => age(i) <= windowMs);
    const priorItems = withTheme.filter(
      (i) => age(i) > windowMs && age(i) <= 2 * windowMs,
    );

    const bySource: Record<string, TopicBreakdown> = {};
    for (const i of recentItems) {
      const k = i.source;
      bySource[k] ??= { recent: 0, prior: 0 };
      bySource[k].recent++;
    }
    for (const i of priorItems) {
      const k = i.source;
      bySource[k] ??= { recent: 0, prior: 0 };
      bySource[k].prior++;
    }

    const recent = recentItems.length;
    const prior = priorItems.length;
    const meetsVolume = recent >= config.minVolume;
    const meetsRatio = prior === 0 ? meetsVolume : recent / prior >= config.ratio;
    const emerging = meetsVolume && meetsRatio;

    return {
      label,
      recent,
      prior,
      emerging,
      examples: withTheme.slice(0, 2).map((i) => i.text),
      bySource,
    };
  });
}

// Ordena emergentes primero, luego por volumen recent desc.
export function sortByEmergence<
  T extends { emerging: boolean; recent: number },
>(topics: T[]): T[] {
  return topics
    .slice()
    .sort(
      (a, b) => Number(b.emerging) - Number(a.emerging) || b.recent - a.recent,
    );
}
