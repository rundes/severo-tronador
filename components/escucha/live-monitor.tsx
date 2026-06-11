"use client";

// Tablero de monitoreo EN VIVO. Ocupa el viewport (no scroll de página): el
// stream de menciones es la única región con scroll y se actualiza por polling
// a /escucha/live; los ítems nuevos entran animados. Movimiento = estado real
// (datos que llegan), no decoración. Respeta prefers-reduced-motion.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ListeningResult, Topic } from "@/lib/listening";
import { feedKey, topicKey } from "@/lib/escucha-keys";
import { TagCloud } from "@/components/escucha/tag-cloud";
import { AuthorRankingList } from "@/components/escucha/author-ranking";
import { VolumeChart } from "@/components/escucha/volume-chart";
import { MarkButton } from "@/components/escucha/mark-button";
import { RadioPlayer } from "@/components/escucha/radio-player";
import { ReportTray } from "@/components/escucha/report-tray";

const POLL_MS = 30_000;

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
  for (const [k, v] of Object.entries(SOURCE_ICON)) if (source.includes(k)) return v;
  return "•";
}
function relativeAgo(ts?: string): string {
  if (!ts) return "—";
  const m = Math.round((Date.now() - +new Date(ts)) / 60_000);
  if (!Number.isFinite(m) || m < 0) return "—";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function dotClass(s: string): string {
  return s === "positive" ? "bg-emerald-500" : s === "negative" ? "bg-red-500" : "bg-zinc-400 dark:bg-zinc-600";
}

export function LiveMonitor({
  initial,
  markedKeys,
  persistOk,
  territory,
}: {
  initial: ListeningResult;
  markedKeys: string[];
  persistOk: boolean;
  territory: string;
}) {
  const [result, setResult] = useState<ListeningResult>(initial);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [live, setLive] = useState(true);

  // Claves del informe: Set para contar en vivo (idempotente ante doble-toggle).
  const initialMarked = useMemo(() => new Set(markedKeys), [markedKeys]);
  const [markedSet, setMarkedSet] = useState<Set<string>>(() => new Set(markedKeys));
  function updateMarked(key: string, marked: boolean) {
    setMarkedSet((s) => {
      const n = new Set(s);
      if (marked) n.add(key);
      else n.delete(key);
      return n;
    });
  }

  // Claves ya vistas: las nuevas (llegadas por polling) se animan al entrar.
  // Sembrado con el feed inicial para no animar la carga (sin orquestación).
  const [seen, setSeen] = useState<Set<string>>(() => new Set(initial.feed.map(feedKey)));

  // Polling del stream.
  useEffect(() => {
    let active = true;
    const id = setInterval(async () => {
      try {
        const res = await fetch("/escucha/live", { cache: "no-store" });
        const data = (await res.json()) as { ok?: boolean; result?: ListeningResult };
        if (!active) return;
        if (data.ok && data.result) {
          setResult(data.result);
          setSecondsAgo(0);
          setLive(true);
        } else {
          setLive(false);
        }
      } catch {
        if (active) setLive(false);
      }
    }, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  // Ticker "hace Xs".
  useEffect(() => {
    const id = setInterval(() => setSecondsAgo((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Tras animar los ítems nuevos, marcarlos como vistos (con delay para no
  // cortar la animación de entrada). Re-render posterior les saca la clase.
  useEffect(() => {
    const fresh = result.feed.map(feedKey).filter((k) => !seen.has(k));
    if (fresh.length === 0) return;
    const t = setTimeout(() => {
      setSeen((s) => {
        const n = new Set(s);
        for (const k of fresh) n.add(k);
        return n;
      });
    }, 320);
    return () => clearTimeout(t);
  }, [result.feed, seen]);

  const { feed, topics, bySentiment, positiveTags, negativeTags, topPositive, topNegative, bySource } = result;
  const emerging = topics.filter((t) => t.emerging);
  const total = bySentiment.positive + bySentiment.negative + bySentiment.neutral || 1;
  const pos = Math.round((bySentiment.positive / total) * 100);
  const neg = Math.round((bySentiment.negative / total) * 100);
  const neu = Math.max(0, 100 - pos - neg);

  return (
    <div className="flex h-[calc(100dvh-12rem)] min-h-[34rem] flex-col gap-3">
      {/* ── Top rail ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Pulso · {territory}
          </h2>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className={`escucha-live-dot h-2 w-2 rounded-full ${live ? "bg-emerald-500" : "bg-amber-500"}`}
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
              {live ? "en vivo" : "reconectando"}
            </span>
          </span>
          <span className="font-mono text-[10px] tabular-nums text-zinc-400">hace {secondsAgo}s</span>

          {/* Barra de ratio de sentiment + cifras */}
          <span className="flex items-center gap-2">
            <span className="flex h-2 w-32 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" aria-hidden>
              <span className="bg-emerald-500" style={{ width: `${pos}%` }} />
              <span className="bg-zinc-300 dark:bg-zinc-600" style={{ width: `${neu}%` }} />
              <span className="bg-red-500" style={{ width: `${neg}%` }} />
            </span>
            <span className="font-mono text-[10px] tabular-nums text-zinc-500">
              {result.totalItems} menc · <span className="text-emerald-600 dark:text-emerald-400">{bySentiment.positive}+</span>{" "}
              <span className="text-red-600 dark:text-red-400">{bySentiment.negative}−</span>
            </span>
          </span>
        </div>
        <ReportTray markedCount={markedSet.size} disabled={!persistOk} />
      </div>

      {/* ── Tablero ──────────────────────────────────────────────────────── */}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_minmax(320px,380px)]">
        {/* Stream en vivo (única región con scroll grande) */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Stream · menciones
            </h3>
            <span className="font-mono text-[10px] tabular-nums text-zinc-400">{feed.length}</span>
          </div>
          {feed.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-zinc-500">
              Sin menciones por ahora. Ajustá keywords o zona en Configurar.
            </div>
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800/70">
              {feed.map((item) => {
                const key = feedKey(item);
                const isNew = !seen.has(key);
                return (
                  <li
                    key={key}
                    className={`flex gap-3 px-4 py-3 ${isNew ? "escucha-enter" : ""}`}
                  >
                    <span aria-hidden className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotClass(item.sentiment)}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                        <span className="font-mono uppercase tracking-wider text-zinc-500">
                          {sourceIcon(item.source)} {item.source}
                        </span>
                        <span className="truncate text-zinc-400">{item.author ?? "—"}</span>
                        <span className="ml-auto shrink-0 font-mono tabular-nums text-zinc-400">
                          {relativeAgo(item.publishedAt)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm leading-snug text-zinc-700 dark:text-zinc-200">
                        {item.text}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        {item.url && !item.meta?.audioObject && (
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
                          initialMarked={initialMarked.has(key)}
                          disabled={!persistOk}
                          onChange={(m) => updateMarked(key, m)}
                        />
                        {item.meta && item.meta.audioObject ? <RadioPlayer meta={item.meta} /> : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Paneles laterales (scroll propio) */}
        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-0.5">
          <Panel title="Volumen / día">
            <div className="flex justify-center py-1">
              <VolumeChart feed={feed} width={320} height={56} />
            </div>
            {Object.keys(bySource).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(bySource)
                  .sort(([, a], [, b]) => b - a)
                  .map(([src, cnt]) => (
                    <span
                      key={src}
                      className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {sourceIcon(src)} {cnt}
                    </span>
                  ))}
              </div>
            )}
          </Panel>

          {emerging.length > 0 && (
            <Panel title="Temas emergentes" accent>
              <ul className="space-y-2">
                {emerging.map((t) => (
                  <EmergingRow
                    key={t.label}
                    topic={t}
                    initialMarked={initialMarked.has(topicKey(t.label))}
                    persistOk={persistOk}
                    onMark={(m) => updateMarked(topicKey(t.label), m)}
                  />
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="Tags">
            <div className="space-y-3">
              <div>
                <Subhead dot="bg-emerald-500" label="Positivos" right={bySentiment.positive} />
                <TagCloud tags={positiveTags} tone="positive" />
              </div>
              <div>
                <Subhead dot="bg-red-500" label="Negativos" right={bySentiment.negative} />
                <TagCloud tags={negativeTags} tone="negative" />
              </div>
            </div>
          </Panel>

          <Panel title="Autores">
            <div className="space-y-3">
              <div>
                <Subhead dot="bg-emerald-500" label="En positivo" />
                <AuthorRankingList authors={topPositive} tone="positive" />
              </div>
              <div>
                <Subhead dot="bg-red-500" label="En negativo" />
                <AuthorRankingList authors={topNegative} tone="negative" />
              </div>
            </div>
          </Panel>

          {!persistOk && (
            <p className="px-1 text-[11px] text-amber-600 dark:text-amber-400">
              Sin Supabase: datos con defaults y marcado deshabilitado.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function Panel({ title, children, accent }: { title: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <section
      className={`rounded-lg border p-3 ${
        accent
          ? "border-amber-300/70 bg-amber-50/50 dark:border-amber-800/40 dark:bg-amber-950/20"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{title}</h3>
      {children}
    </section>
  );
}

function Subhead({ dot, label, right }: { dot: string; label: string; right?: number }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      {right !== undefined && (
        <span className="ml-auto font-mono text-[10px] tabular-nums text-zinc-400">{right}</span>
      )}
    </div>
  );
}

function EmergingRow({
  topic,
  initialMarked,
  persistOk,
  onMark,
}: {
  topic: Topic;
  initialMarked: boolean;
  persistOk: boolean;
  onMark: (marked: boolean) => void;
}) {
  return (
    <li className="rounded-md border border-amber-200/70 bg-amber-50 px-2.5 py-2 dark:border-amber-900/40 dark:bg-amber-950/30">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-amber-900 dark:text-amber-200">
            <span className="text-amber-500">↑</span> {topic.label}
          </div>
          <div className="font-mono text-[10px] tabular-nums text-amber-700 dark:text-amber-300">
            {topic.recent} <span className="opacity-60">/ {topic.prior} previa</span>
          </div>
        </div>
        <Link
          href={`/campanas/nueva?tema=${encodeURIComponent(topic.label)}`}
          className="shrink-0 rounded bg-amber-900 px-2 py-1 text-[10px] font-medium text-amber-50 hover:bg-amber-800 dark:bg-amber-100 dark:text-amber-950 dark:hover:bg-amber-200"
        >
          Encuesta →
        </Link>
      </div>
      <div className="mt-1.5">
        <MarkButton
          itemKey={topicKey(topic.label)}
          kind="topic"
          payload={{ label: topic.label, recent: topic.recent, prior: topic.prior }}
          initialMarked={initialMarked}
          disabled={!persistOk}
          onChange={onMark}
        />
      </div>
    </li>
  );
}
