// Embudo de filtros (F1.4) + cost preview por canal (F1.6).
// Server component — el cálculo viene server-side.
import type { FunnelStep } from "@/lib/segments";
import type { ChannelCost } from "@/lib/segments-cost";
import type { Channel } from "@/lib/relationship";

const CHANNEL_ICON: Record<Channel, string> = {
  email: "📧",
  whatsapp: "💬",
  sms: "📱",
  voice: "☎️",
};

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export function FunnelView({
  total,
  steps,
}: {
  total: number;
  steps: FunnelStep[];
}) {
  if (steps.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 p-3 text-xs text-zinc-500 dark:border-zinc-700">
        Sin filtros activos — embudo vacío. Aplicá filtros arriba para ver
        dónde cae la audiencia.
      </div>
    );
  }
  const rows = stepsWithDrop(total, steps);
  return (
    <div className="space-y-1 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
        Embudo de filtros
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-500">Padrón total</span>
        <span className="font-mono text-zinc-700 dark:text-zinc-300">{total}</span>
      </div>
      {rows.map((s) => (
        <div
          key={s.key}
          className="flex items-center justify-between gap-2 text-sm"
        >
          <span className="flex-1 text-zinc-600 dark:text-zinc-300">
            ↳ {s.label}
          </span>
          <span className="font-mono text-zinc-400">
            {s.drop > 0 ? `−${s.drop} (−${s.dropPct}%)` : "—"}
          </span>
          <span className="w-12 text-right font-mono text-zinc-700 dark:text-zinc-300">
            {s.count}
          </span>
        </div>
      ))}
    </div>
  );
}

function stepsWithDrop(
  total: number,
  steps: FunnelStep[],
): (FunnelStep & { drop: number; dropPct: number })[] {
  let prev = total;
  return steps.map((s) => {
    const drop = prev - s.count;
    const dropPct = pct(drop, prev);
    prev = s.count;
    return { ...s, drop, dropPct };
  });
}

export function CostPreview({ costs }: { costs: ChannelCost[] }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
        Costo estimado por canal
      </div>
      <div className="space-y-0.5">
        {costs.map((c) => (
          <div key={c.channel} className="flex items-center justify-between">
            <span className="text-zinc-600 dark:text-zinc-300">
              {CHANNEL_ICON[c.channel]} {c.channel}
            </span>
            <span className="font-mono text-zinc-700 dark:text-zinc-300">
              {c.willFit ? (
                <span className="text-emerald-600">
                  ${c.estUsd.toFixed(2)} (entra en cuota)
                </span>
              ) : (
                <span className="text-amber-600">
                  ${c.estUsd.toFixed(2)} · {c.paidUnits} {c.unit} pagos
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-xs text-zinc-400">
        Voz estimado a 2 min/llamada. Email/WhatsApp 0 USD dentro del free
        tier mensual; sobrepasarlo no está modelado hoy.
      </div>
    </div>
  );
}
