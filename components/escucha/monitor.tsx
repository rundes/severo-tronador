// Vista inmersiva de monitoreo. Server component.
// 4 bloques: (1) barra de pulso, (2) temas emergentes, (3) feed wall,
// (4) sentiment + tags + autores.
import Link from "next/link";
import { TERRITORY } from "@/lib/config";
import type { ListeningResult, FeedItem, Topic } from "@/lib/listening";
import type { Marca } from "@/lib/escucha-marcas";
import { itemKey as makeKey } from "@/lib/escucha-marcas";
import { TagCloud } from "@/components/escucha/tag-cloud";
import { AuthorRankingList } from "@/components/escucha/author-ranking";
import { VolumeChart } from "@/components/escucha/volume-chart";
import { MarkButton } from "@/components/escucha/mark-button";
import { ReportTray } from "@/components/escucha/report-tray";

interface MonitorProps {
  result: ListeningResult;
  marcas: Marca[];
  persistOk: boolean;
}

// Build a Set of marked keys for fast lookup.
function markedKeySet(marcas: Marca[]): Set<string> {
  return new Set(marcas.map((m) => m.itemKey));
}

function feedItemKey(item: FeedItem): string {
  return makeKey(item.url || item.text);
}

function topicItemKey(topic: Topic): string {
  return makeKey("topic:" + topic.label);
}

function sentimentBadge(s: string) {
  if (s === "positive")
    return (
      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
        pos
      </span>
    );
  if (s === "negative")
    return (
      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-red-800 dark:bg-red-900/40 dark:text-red-300">
        neg
      </span>
    );
  return (
    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
      neu
    </span>
  );
}

const SOURCE_ICON: Record<string, string> = {
  "x-api": "𝕏",
  "x.com": "𝕏",
  "reddit-api": "R/",
  gdelt: "📰",
  "meta-ig": "IG",
  "meta-fb": "FB",
  "rss-medios": "RSS",
};

function sourceIcon(source: string): string {
  for (const [k, v] of Object.entries(SOURCE_ICON)) {
    if (source.includes(k)) return v;
  }
  return "•";
}

function sourceBadge(source: string) {
  return (
    <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      {sourceIcon(source)} {source}
    </span>
  );
}

function relativeAgo(ts?: string): string {
  if (!ts) return "—";
  const ms = Date.now() - +new Date(ts);
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}

// Stat card for the pulse bar.
function PulseStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "zinc" | "emerald" | "red";
}) {
  const colors =
    accent === "emerald"
      ? "border-emerald-200 dark:border-emerald-900/40"
      : accent === "red"
        ? "border-red-200 dark:border-red-900/40"
        : "border-zinc-200 dark:border-zinc-800";
  const valColor =
    accent === "emerald"
      ? "text-emerald-700 dark:text-emerald-400"
      : accent === "red"
        ? "text-red-700 dark:text-red-400"
        : "text-zinc-800 dark:text-zinc-100";
  return (
    <div className={`rounded-lg border p-4 ${colors}`}>
      <div className={`text-4xl font-semibold tabular-nums ${valColor}`}>
        {value}
      </div>
      <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </div>
    </div>
  );
}

export function Monitor({ result, marcas, persistOk }: MonitorProps) {
  const {
    totalItems,
    bySentiment,
    topics,
    positiveTags,
    negativeTags,
    topPositive,
    topNegative,
    feed,
    bySource,
  } = result;

  const emerging = topics.filter((t) => t.emerging);
  const markedKeys = markedKeySet(marcas);
  const markedCount = marcas.length;

  return (
    <div className="space-y-8">
      {/* ── 1. Barra de pulso ──────────────────────────────────────────── */}
      <section aria-labelledby="pulso-titulo">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h2
              id="pulso-titulo"
              className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500"
            >
              Pulso · {TERRITORY}
            </h2>
            <span className="font-mono text-[10px] text-zinc-400">
              actualiza cada 60 s
            </span>
          </div>
          <ReportTray markedCount={markedCount} disabled={!persistOk} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <PulseStat label="Menciones totales" value={totalItems} accent="zinc" />
          <PulseStat label="Positivas" value={bySentiment.positive} accent="emerald" />
          <PulseStat label="Negativas" value={bySentiment.negative} accent="red" />
          <PulseStat label="Neutras" value={bySentiment.neutral} accent="zinc" />

          {/* Sparkline */}
          <div className="flex items-end rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Volumen / día
              </div>
              <VolumeChart feed={feed} width={200} height={48} />
            </div>
          </div>
        </div>

        {/* Source mini-stats */}
        {Object.keys(bySource).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(bySource)
              .sort(([, a], [, b]) => b - a)
              .map(([src, cnt]) => (
                <span
                  key={src}
                  className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {sourceIcon(src)} {src} · {cnt}
                </span>
              ))}
          </div>
        )}
      </section>

      {/* ── 2. Temas emergentes ────────────────────────────────────────── */}
      {emerging.length > 0 && (
        <section aria-labelledby="emergentes-titulo">
          <h2
            id="emergentes-titulo"
            className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500"
          >
            Temas emergentes
          </h2>
          <div className="space-y-3">
            {emerging.map((t) => {
              const key = topicItemKey(t);
              const isMarked = markedKeys.has(key);
              const sourceBreakdown = Object.entries(t.bySource ?? {})
                .filter(([, v]) => v.recent > 0)
                .sort(([, a], [, b]) => b.recent - a.recent);
              return (
                <div
                  key={t.label}
                  className="rounded-lg border border-amber-300 bg-amber-50 p-5 dark:border-amber-800/50 dark:bg-amber-950/30"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">
                          Emergente
                        </span>
                        <span className="text-amber-500">↑</span>
                      </div>
                      <div className="mt-1 text-lg font-semibold text-amber-900 dark:text-amber-200">
                        {t.label}
                      </div>
                      <div className="mt-1 font-mono text-xs text-amber-700 dark:text-amber-300">
                        {t.recent} esta semana{" "}
                        <span className="opacity-60">/ {t.prior} previa</span>
                      </div>
                      {sourceBreakdown.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                          {sourceBreakdown.map(([src, v]) => (
                            <span
                              key={src}
                              className="rounded bg-amber-100 px-1.5 py-0.5 font-mono uppercase tracking-wider text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                              title={`${v.recent} recent · ${v.prior} prior`}
                            >
                              {src} · {v.recent}
                              {v.prior > 0 && (
                                <span className="opacity-60"> / {v.prior}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Link
                        href={`/campanas/nueva?tema=${encodeURIComponent(t.label)}`}
                        className="rounded bg-amber-900 px-3 py-1.5 text-sm text-amber-50 hover:bg-amber-800 dark:bg-amber-100 dark:text-amber-950 dark:hover:bg-amber-200"
                      >
                        Diseñar encuesta →
                      </Link>
                      <MarkButton
                        itemKey={key}
                        kind="topic"
                        payload={{
                          label: t.label,
                          recent: t.recent,
                          prior: t.prior,
                        }}
                        initialMarked={isMarked}
                        disabled={!persistOk}
                      />
                    </div>
                  </div>
                  {t.examples.slice(0, 2).map((ex, i) => (
                    <p
                      key={i}
                      className="mt-2 text-xs italic text-amber-700 dark:text-amber-400"
                    >
                      &ldquo;{ex}&rdquo;
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── 3. Feed wall ──────────────────────────────────────────────── */}
      <section aria-labelledby="feed-titulo">
        <div className="mb-3 flex items-baseline justify-between">
          <h2
            id="feed-titulo"
            className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500"
          >
            Feed · últimas menciones
          </h2>
          <span className="font-mono text-[10px] text-zinc-400">
            {feed.length} ítems
          </span>
        </div>

        {feed.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
            Sin menciones en este momento. Probá afinar las keywords o ajustar
            la zona.
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {feed.map((item, i) => {
                const key = feedItemKey(item);
                const isMarked = markedKeys.has(key);
                const dotColor =
                  item.sentiment === "positive"
                    ? "bg-emerald-500"
                    : item.sentiment === "negative"
                      ? "bg-red-500"
                      : "bg-zinc-300 dark:bg-zinc-700";
                return (
                  <li
                    key={i}
                    className="flex gap-3 px-4 py-3 transition-colors hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40"
                  >
                    <div
                      aria-hidden
                      className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {sourceBadge(item.source)}
                        {sentimentBadge(item.sentiment)}
                        <span className="truncate text-zinc-500">
                          {item.author ?? item.source}
                        </span>
                        <span className="ml-auto shrink-0 font-mono text-zinc-400">
                          {relativeAgo(item.publishedAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 line-clamp-3 text-sm text-zinc-700 dark:text-zinc-200">
                        {item.text}
                      </p>
                      <div className="mt-2 flex items-center gap-3">
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] uppercase tracking-wider text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                          >
                            abrir →
                          </a>
                        )}
                        <MarkButton
                          itemKey={key}
                          kind="feed"
                          payload={{
                            text: item.text,
                            source: item.source,
                            author: item.author ?? null,
                            url: item.url ?? null,
                            sentiment: item.sentiment,
                            publishedAt: item.publishedAt ?? null,
                          }}
                          initialMarked={isMarked}
                          disabled={!persistOk}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {/* ── 4. Sentiment + tags + autores ────────────────────────────── */}
      <section aria-labelledby="analisis-titulo">
        <h2
          id="analisis-titulo"
          className="mb-4 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500"
        >
          Análisis · sentiment · tags · autores
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Tags positivos */}
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="mb-3 flex items-center gap-2">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                Tags positivos
              </h3>
              <span className="ml-auto font-mono text-[11px] text-zinc-400">
                {bySentiment.positive}
              </span>
            </div>
            <TagCloud tags={positiveTags} tone="positive" />
          </div>

          {/* Tags negativos */}
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="mb-3 flex items-center gap-2">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-red-500" />
              <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                Tags negativos
              </h3>
              <span className="ml-auto font-mono text-[11px] text-zinc-400">
                {bySentiment.negative}
              </span>
            </div>
            <TagCloud tags={negativeTags} tone="negative" />
          </div>

          {/* Autores positivos */}
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="mb-3 flex items-center gap-2">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                Conversan en positivo
              </h3>
            </div>
            <AuthorRankingList authors={topPositive} tone="positive" />
          </div>

          {/* Autores negativos */}
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="mb-3 flex items-center gap-2">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-red-500" />
              <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                Conversan en negativo
              </h3>
            </div>
            <AuthorRankingList authors={topNegative} tone="negative" />
          </div>
        </div>

        {/* All topics (non-emerging) */}
        {topics.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
              Temas detectados (semana vs baseline)
            </h3>
            <ul className="space-y-1.5">
              {topics.map((t) => {
                const key = topicItemKey(t);
                const isMarked = markedKeys.has(key);
                return (
                  <li
                    key={t.label}
                    className="flex items-start gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                  >
                    <div className="flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">
                          {t.label}
                          {t.emerging && (
                            <span className="ml-2 text-amber-600">↑</span>
                          )}
                        </span>
                        <span className="font-mono text-xs text-zinc-400">
                          {t.recent}{" "}
                          <span className="text-zinc-300 dark:text-zinc-600">/</span>{" "}
                          {t.prior}
                        </span>
                      </div>
                      {t.examples.slice(0, 1).map((ex, i) => (
                        <p key={i} className="mt-0.5 text-xs text-zinc-500">
                          {ex}
                        </p>
                      ))}
                    </div>
                    <MarkButton
                      itemKey={key}
                      kind="topic"
                      payload={{
                        label: t.label,
                        recent: t.recent,
                        prior: t.prior,
                      }}
                      initialMarked={isMarked}
                      disabled={!persistOk}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {!persistOk && Object.keys(bySource).length > 0 && (
        <p className="text-xs text-amber-600">
          Corrida con defaults: no se aplicó tu config (sin Supabase). Las
          fuentes reales (GDELT/X) sí trajeron lo que pudieron.
        </p>
      )}
    </div>
  );
}
