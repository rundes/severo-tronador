// Sparkline SVG inline de volumen por día. Server component.
import { volumeBuckets } from "@/lib/escucha-marcas";
import type { FeedItem } from "@/lib/listening";

interface VolumeChartProps {
  feed: Pick<FeedItem, "publishedAt">[];
  width?: number;
  height?: number;
}

export function VolumeChart({
  feed,
  width = 180,
  height = 40,
}: VolumeChartProps) {
  const buckets = volumeBuckets(feed);

  if (buckets.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded border border-dashed border-zinc-200 text-[10px] text-zinc-400 dark:border-zinc-800"
        style={{ width, height }}
      >
        sin datos
      </div>
    );
  }

  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const barW = Math.max(2, Math.floor((width - (buckets.length - 1) * 2) / buckets.length));
  const gap = 2;
  const svgWidth = buckets.length * barW + (buckets.length - 1) * gap;
  const INDIGO = "oklch(52% 0.13 255)";
  const INDIGO_DIM = "oklch(52% 0.13 255 / 0.25)";

  // Most recent bucket gets full accent; earlier ones are dimmer.
  const lastIdx = buckets.length - 1;

  return (
    <svg
      width={svgWidth}
      height={height}
      viewBox={`0 0 ${svgWidth} ${height}`}
      aria-label="Volumen de menciones por día"
      role="img"
      className="shrink-0"
    >
      {buckets.map((b, i) => {
        const barH = Math.max(2, Math.round((b.count / maxCount) * (height - 4)));
        const x = i * (barW + gap);
        const y = height - barH;
        const fill = i === lastIdx ? INDIGO : INDIGO_DIM;
        return (
          <rect
            key={b.day}
            x={x}
            y={y}
            width={barW}
            height={barH}
            fill={fill}
            rx={1}
          >
            <title>
              {b.day}: {b.count}
            </title>
          </rect>
        );
      })}
    </svg>
  );
}
