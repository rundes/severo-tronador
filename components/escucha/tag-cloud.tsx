import type { TagCount } from "@/lib/sentiment";

// Nube de tags ponderada por count. La fuente escala log-base para que el
// rango no se desborde con outliers.
export function TagCloud({
  tags,
  tone,
}: {
  tags: TagCount[];
  tone: "positive" | "negative";
}) {
  if (tags.length === 0) {
    return (
      <p className="text-xs text-zinc-400">
        Sin tags todavía en este sentimiento.
      </p>
    );
  }
  const max = Math.max(...tags.map((t) => t.count));
  const min = Math.min(...tags.map((t) => t.count));
  const baseColor =
    tone === "positive"
      ? "oklch(45% 0.13 160)" // verde teal
      : "oklch(48% 0.14 30)"; // terracota
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      {tags.map(({ tag, count }) => {
        const scale =
          max === min ? 1 : (Math.log(count) - Math.log(min)) / (Math.log(max) - Math.log(min) || 1);
        const fontSize = 11 + scale * 13; // 11px..24px
        const opacity = 0.55 + scale * 0.45;
        return (
          <span
            key={tag}
            className="font-medium leading-tight"
            style={{
              fontSize: `${fontSize}px`,
              color: baseColor,
              opacity,
            }}
            title={`${count} menciones`}
          >
            {tag}
          </span>
        );
      })}
    </div>
  );
}
