// Piezas compartidas por los bloques de Escenario: Field (label + hint +
// diff "vigente → propuesto"), filas de estado por fuente cargada y por
// fuente automática, y el tipo SourceStatus de los conectores togglables.
import { statsKeyFor } from "@/lib/escucha-fuentes";
import type { PullSummary, SourceCounts } from "@/lib/listening-cache";

export interface SourceStatus {
  id: string;
  label: string;
  real: boolean;
  reason: string;
  countIds?: string[];
}

export function timeAgo(iso: string | null | undefined, now: number): string {
  if (!iso) return "nunca";
  const ms = now - +new Date(iso);
  if (Number.isNaN(ms)) return "?";
  const min = Math.round(ms / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

export function Field({
  label,
  children,
  hint,
  diff,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
  diff?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
          {label}
          {diff && (
            <span className="ml-2 normal-case tracking-normal text-amber-700 dark:text-amber-300">
              {diff}
            </span>
          )}
        </span>
        {children}
      </label>
      {hint && <p className="max-w-[70ch] text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

// Estado por fuente cargada: menciones 7d + última + error del último pull.
export function SourceRows({
  urls,
  counts,
  summary,
  emptyNote,
  now,
}: {
  urls: string[];
  counts: SourceCounts;
  summary: PullSummary | null;
  emptyNote?: string;
  now: number;
}) {
  if (urls.length === 0) return null;
  const errorFor = (url: string) =>
    summary?.errors.find((e) => e.source === url)?.detail;
  return (
    <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {urls.map((url) => {
        const stat = counts.bySource[statsKeyFor(url)];
        const err = errorFor(url);
        return (
          <li
            key={url}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-1.5 text-xs"
          >
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
              {url.replace(/^https?:\/\/(www\.)?/, "")}
            </span>
            {err ? (
              <span className="text-red-600 dark:text-red-400">
                falla: {err.slice(0, 60)}
              </span>
            ) : stat ? (
              <span className="font-mono tabular-nums text-zinc-600 dark:text-zinc-300">
                {stat.count} menciones 7d
                <span className="text-zinc-500"> · última {timeAgo(stat.last, now)}</span>
              </span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">
                {emptyNote ?? "sin datos aún"}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Fuentes automáticas (sin URL que cargar): estado por conector.
export function AutoRow({
  label,
  detail,
  stat,
  error,
  now,
}: {
  label: string;
  detail: string;
  stat?: { count: number; last: string | null };
  error?: string;
  now: number;
}) {
  const count = stat?.count ?? 0;
  const last = stat?.last ?? null;
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-1.5 text-xs">
      <span className="min-w-0 flex-1 text-zinc-700 dark:text-zinc-200">
        {label}
        <span className="text-zinc-500"> · {detail}</span>
      </span>
      {error ? (
        <span className="text-red-600 dark:text-red-400">falla: {error.slice(0, 60)}</span>
      ) : count > 0 ? (
        <span className="font-mono tabular-nums text-zinc-600 dark:text-zinc-300">
          {count} menciones 7d
          <span className="text-zinc-500"> · última {timeAgo(last, now)}</span>
        </span>
      ) : (
        <span className="text-zinc-500">sin menciones en 7d</span>
      )}
    </li>
  );
}
