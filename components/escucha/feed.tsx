import type { FeedItem } from "@/lib/listening";

const SOURCE_DOT: Record<string, string> = {
  "x.com": "𝕏",
  "x-api": "𝕏",
  "reddit-api": "👽",
  gdelt: "📰",
  "meta-ig": "📸",
  "meta-fb": "📘",
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

interface ThreadGroup {
  parent: FeedItem | null; // null cuando el comment llegó sin su padre
  parentUrl: string;
  comments: FeedItem[];
}

// Agrupa items por URL del post padre. Items sin parentUrl que NO son
// padres conocidos quedan como standalone (parent = item mismo, sin comments).
function groupThreads(items: FeedItem[]): (FeedItem | ThreadGroup)[] {
  const byUrl = new Map<string, FeedItem>();
  for (const it of items) {
    if (it.kind !== "comment" && it.url) byUrl.set(it.url, it);
  }
  // Buckets de comentarios por parentUrl.
  const commentsByParent = new Map<string, FeedItem[]>();
  for (const it of items) {
    if (it.kind !== "comment" || !it.parentUrl) continue;
    const arr = commentsByParent.get(it.parentUrl) ?? [];
    arr.push(it);
    commentsByParent.set(it.parentUrl, arr);
  }

  const seenParentUrls = new Set<string>();
  const out: (FeedItem | ThreadGroup)[] = [];
  for (const it of items) {
    if (it.kind === "comment") {
      // Si el padre está en el feed, lo manejamos cuando llegue su turno.
      if (it.parentUrl && byUrl.has(it.parentUrl)) continue;
      // Padre ausente: agrupamos los huérfanos del mismo parentUrl.
      if (it.parentUrl && !seenParentUrls.has(it.parentUrl)) {
        seenParentUrls.add(it.parentUrl);
        out.push({
          parent: null,
          parentUrl: it.parentUrl,
          comments: commentsByParent.get(it.parentUrl) ?? [it],
        });
      } else if (!it.parentUrl) {
        out.push(it);
      }
      continue;
    }
    // Es un post/reel/tweet: si tiene comments en el feed, armamos thread.
    if (it.url && commentsByParent.has(it.url)) {
      seenParentUrls.add(it.url);
      out.push({
        parent: it,
        parentUrl: it.url,
        comments: commentsByParent.get(it.url) ?? [],
      });
    } else {
      out.push(it);
    }
  }
  return out;
}

function isGroup(x: FeedItem | ThreadGroup): x is ThreadGroup {
  return (x as ThreadGroup).comments !== undefined;
}

function FeedRow({ item, indent }: { item: FeedItem; indent?: boolean }) {
  const dotColor =
    item.sentiment === "positive"
      ? "bg-emerald-500"
      : item.sentiment === "negative"
        ? "bg-red-500"
        : "bg-zinc-300 dark:bg-zinc-700";
  return (
    <div
      className={`flex gap-3 px-4 py-3 transition-colors hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40 ${
        indent ? "pl-10" : ""
      }`}
    >
      <div
        aria-hidden
        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="truncate text-zinc-500">
            {sourceIcon(item.source)} {item.author ?? item.source}
            {item.kind === "comment" && (
              <span className="ml-1 rounded bg-zinc-100 px-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                comment
              </span>
            )}
            {item.kind === "reel" && (
              <span className="ml-1 rounded bg-zinc-100 px-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                reel
              </span>
            )}
          </span>
          <span className="shrink-0 font-mono text-zinc-400">
            {relativeAgo(item.publishedAt)}
          </span>
        </div>
        <p className="mt-1 line-clamp-3 text-sm text-zinc-700 dark:text-zinc-200">
          {item.text}
        </p>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-[10px] uppercase tracking-wider text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            abrir →
          </a>
        )}
      </div>
    </div>
  );
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
  const grouped = groupThreads(items);
  return (
    <div className="relative max-h-[480px] overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {grouped.map((entry, i) => {
          if (!isGroup(entry)) {
            return (
              <li key={i}>
                <FeedRow item={entry} />
              </li>
            );
          }
          return (
            <li key={i} className="bg-zinc-50/30 dark:bg-zinc-900/20">
              {entry.parent ? (
                <FeedRow item={entry.parent} />
              ) : (
                <div className="px-4 pt-3 text-[10px] uppercase tracking-wider text-zinc-400">
                  Hilo · post padre no incluido
                </div>
              )}
              <div className="mb-1 ml-4 border-l border-zinc-200 dark:border-zinc-800">
                <div className="px-3 pt-1.5 text-[10px] uppercase tracking-wider text-zinc-400">
                  💬 {entry.comments.length}{" "}
                  {entry.comments.length === 1 ? "respuesta" : "respuestas"}
                </div>
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {entry.comments.map((c, j) => (
                    <li key={j}>
                      <FeedRow item={c} indent />
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
