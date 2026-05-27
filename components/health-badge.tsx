import { healthBand } from "@/lib/relationship";

const BAND = {
  green: { emoji: "🟢", text: "text-emerald-700", label: "sana" },
  yellow: { emoji: "🟡", text: "text-amber-700", label: "tibia" },
  red: { emoji: "🔴", text: "text-red-700", label: "deteriorada" },
} as const;

export function HealthBadge({
  score,
  showScore = true,
}: {
  score: number;
  showScore?: boolean;
}) {
  const meta = BAND[healthBand(score)];
  return (
    <span className={`inline-flex items-center gap-1 text-sm ${meta.text}`}>
      {meta.emoji} {showScore ? `${score}/100` : meta.label}
    </span>
  );
}
