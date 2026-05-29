import type { FeedItem } from "@/lib/listening";

const SOURCE_DOT: Record<string, string> = {
  "x.com": "𝕏",
  "x-api": "𝕏",
  "reddit-api": "👽",
  gdelt: "📰",
};

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

function sourceIcon(source: string): string {
  for (const [k, v] of Object.entries(SOURCE_DOT)) {
    if (source.includes(k)) return v;
  }
  return "•";
}

export function Feed({ items }: { items: FeedItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
        Sin menciones en este momento. Probá afinar las keywords o ajustar
        la zona.
      </div>
    );
  }
  return (
    <div className="relative max-h-[480px] overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {items.map((it, i) => {
          const dotColor =
            it.sentiment === "positive"
              ? "bg-emerald-500"
              : it.sentiment === "negative"
                ? "bg-red-500"
                : "bg-zinc-300 dark:bg-zinc-700";
          return (
            <li
              key={i}
              className="flex gap-3 px-4 py-3 transition-colors hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40"
            >
              <div
                aria-hidden
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="truncate text-zinc-500">
                    {sourceIcon(it.source)} {it.author ?? it.source}
                  </span>
                  <span className="shrink-0 font-mono text-zinc-400">
                    {relativeAgo(it.publishedAt)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-3 text-sm text-zinc-700 dark:text-zinc-200">
                  {it.text}
                </p>
                {it.url && (
                  <a
                    href={it.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-[10px] uppercase tracking-wider text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    abrir →
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
