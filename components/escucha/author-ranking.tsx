import type { AuthorRanking } from "@/lib/listening";

export function AuthorRankingList({
  authors,
  tone,
}: {
  authors: AuthorRanking[];
  tone: "positive" | "negative";
}) {
  if (authors.length === 0) {
    return (
      <p className="text-xs text-zinc-400">
        Sin datos suficientes en este tono.
      </p>
    );
  }
  return (
    <ol className="space-y-1">
      {authors.map((a, i) => (
        <li
          key={a.author}
          className="flex items-center justify-between gap-3 rounded px-2 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
        >
          <div className="flex min-w-0 items-baseline gap-3">
            <span className="font-mono text-xs text-zinc-400">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="truncate text-zinc-800 dark:text-zinc-200">
              {a.author}
            </span>
          </div>
          <div className="shrink-0 font-mono text-xs">
            <span
              className={
                tone === "positive"
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-red-700 dark:text-red-400"
              }
            >
              {tone === "positive" ? a.positive : a.negative}
            </span>
            <span className="text-zinc-400"> / {a.count}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
