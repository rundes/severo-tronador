// Badge / pill de estado. El color SIEMPRE acompaña texto (nunca color solo),
// por accesibilidad (daltonismo). Tono opcional con punto indicador.
type Tone = "neutral" | "ok" | "warn" | "danger" | "accent";

const TONES: Record<Tone, { box: string; dot: string }> = {
  neutral: { box: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300", dot: "bg-zinc-400" },
  ok: { box: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300", dot: "bg-emerald-500" },
  warn: { box: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300", dot: "bg-amber-500" },
  danger: { box: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300", dot: "bg-red-500" },
  accent: { box: "bg-[var(--accent-soft)] text-[var(--accent-strong)] dark:text-[oklch(72%_0.12_255)]", dot: "bg-[var(--accent)]" },
};

export function Badge({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: React.ReactNode;
  tone?: Tone;
  dot?: boolean;
}) {
  const t = TONES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${t.box}`}
    >
      {dot && <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />}
      {children}
    </span>
  );
}
