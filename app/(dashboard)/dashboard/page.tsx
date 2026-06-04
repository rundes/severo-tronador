import Link from "next/link";
import { loadDashboard, type WindowDays } from "@/lib/analytics";
import { requireProject } from "@/lib/workspace";
import type { Channel } from "@/lib/relationship";

export const metadata = { title: "Dashboard · Tronador" };
export const revalidate = 60;

const CHANNEL_ICON: Record<Channel, string> = {
  email: "📧",
  whatsapp: "💬",
  sms: "📱",
  voice: "☎️", telegram: "✈️",
};

const WINDOWS: { days: WindowDays; label: string }[] = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
];

function parseWindow(v: string | undefined): WindowDays {
  if (v === "7") return 7;
  if (v === "90") return 90;
  return 30;
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtUsd(v: number): string {
  return v === 0 ? "$0" : `$${v.toFixed(2)}`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const { id: projectId } = await requireProject();
  const window = parseWindow(params.window);
  const data = await loadDashboard(projectId, window);
  const { kpis, campaigns, timeSeries, health } = data;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Dashboard
          </h1>
          <p className="mt-1 max-w-[60ch] text-sm text-zinc-500">
            Overview agregado: envíos, respuestas, opt-outs, costo y salud
            del padrón. Selecciona ventana para comparar períodos.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-full border border-zinc-200 p-1 text-xs dark:border-zinc-800">
            {WINDOWS.map((w) => (
              <Link
                key={w.days}
                href={`/dashboard?window=${w.days}`}
                className={`rounded-full px-3 py-1 transition-colors ${
                  w.days === window
                    ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                {w.label}
              </Link>
            ))}
          </div>
          <a
            href={`/api/dashboard/export?window=${window}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            title={`Export zip con CSVs de los últimos ${window} días`}
          >
            ⬇️ ZIP
          </a>
        </div>
      </header>

      {/* KPIs ─────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Enviados" value={kpis.sent.toLocaleString()} />
        <Kpi
          label="Respuestas"
          value={kpis.responses.toLocaleString()}
          sub={fmtPct(kpis.responseRate)}
          subTone={kpis.responseRate >= 0.05 ? "good" : "neutral"}
        />
        <Kpi
          label="Opt-outs"
          value={kpis.optOuts.toLocaleString()}
          sub={fmtPct(kpis.optOutRate)}
          subTone={kpis.optOutRate > 0.02 ? "warn" : "neutral"}
        />
        <Kpi label="Costo estimado" value={fmtUsd(kpis.estCostUsd)} />
      </section>

      {/* Time-series ─────────────────────── */}
      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            Envíos y respuestas / día
          </h2>
          <span className="font-mono text-[11px] text-zinc-400">
            últimos {window}d
          </span>
        </div>
        <TimeSeriesChart points={timeSeries} />
      </section>

      {/* By channel ──────────────────────── */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(kpis.byChannel) as Channel[]).map((ch) => {
          const b = kpis.byChannel[ch];
          const rr = b.sent > 0 ? b.responses / b.sent : 0;
          return (
            <div
              key={ch}
              className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  {CHANNEL_ICON[ch]} {ch}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                  {fmtPct(rr)}
                </span>
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {b.sent.toLocaleString()} enviados
                {" · "}
                <strong className="font-medium text-zinc-700 dark:text-zinc-300">
                  {b.responses.toLocaleString()}
                </strong>{" "}
                respuestas
              </div>
            </div>
          );
        })}
      </section>

      {/* Comparativa campañas ───────────── */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            Campañas en la ventana ({campaigns.length})
          </h2>
        </div>
        {campaigns.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
            Sin campañas creadas en este período.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-[10px] uppercase tracking-wider text-zinc-500 dark:bg-zinc-900/40">
                <tr>
                  <th className="px-3 py-2 font-medium">Campaña</th>
                  <th className="px-3 py-2 font-medium">Canal</th>
                  <th className="px-3 py-2 font-medium text-right">Sent</th>
                  <th className="px-3 py-2 font-medium text-right">Resp</th>
                  <th className="px-3 py-2 font-medium text-right">RR</th>
                  <th className="px-3 py-2 font-medium text-right">USD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {campaigns.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/campanas/${c.id}`}
                        className="text-zinc-800 hover:underline dark:text-zinc-200"
                      >
                        {c.nombre}
                      </Link>
                      <div className="text-[10px] text-zinc-400">
                        {c.created_at.slice(0, 10)}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-zinc-500">
                      {CHANNEL_ICON[c.channel]} {c.channel}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-700 dark:text-zinc-200">
                      {c.sent.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-700 dark:text-zinc-200">
                      {c.responses.toLocaleString()}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono ${
                        c.responseRate >= 0.05
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-zinc-500"
                      }`}
                    >
                      {fmtPct(c.responseRate)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-500">
                      {fmtUsd(c.estCostUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Health distribution ─────────────── */}
      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            Salud del padrón
          </h2>
          <span className="font-mono text-[11px] text-zinc-400">
            {health.total.toLocaleString()} contactos
          </span>
        </div>
        <HealthBars dist={health} />
      </section>
    </div>
  );
}

// ── Components ────────────────────────────────────────────────────────────

function Kpi({
  label,
  value,
  sub,
  subTone,
}: {
  label: string;
  value: string;
  sub?: string;
  subTone?: "good" | "warn" | "neutral";
}) {
  const subCls =
    subTone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : subTone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : "text-zinc-500";
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          {label}
        </span>
        {sub && <span className={`font-mono text-xs ${subCls}`}>{sub}</span>}
      </div>
    </div>
  );
}

function TimeSeriesChart({
  points,
}: {
  points: { day: string; envios: number; responses: number }[];
}) {
  if (points.length === 0) {
    return (
      <p className="text-xs text-zinc-400">Sin datos en este período.</p>
    );
  }
  const max = Math.max(1, ...points.map((p) => p.envios));
  const w = 800;
  const h = 140;
  const barW = w / points.length;
  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${w} ${h + 30}`}
        className="block w-full min-w-[600px]"
        aria-label="Envíos y respuestas por día"
      >
        {points.map((p, i) => {
          const x = i * barW;
          const envH = (p.envios / max) * h;
          const respH = (p.responses / max) * h;
          return (
            <g key={p.day}>
              {/* Bar envios (gris) */}
              <rect
                x={x + 1}
                y={h - envH}
                width={Math.max(1, barW - 2)}
                height={envH}
                fill="oklch(70% 0.02 250)"
              />
              {/* Bar responses (emerald) sobre envios */}
              <rect
                x={x + 1}
                y={h - respH}
                width={Math.max(1, barW - 2)}
                height={respH}
                fill="oklch(55% 0.13 160)"
              />
              {/* Label cada 5 días si la ventana es chica, cada 10 si es grande */}
              {(points.length <= 14 ||
                i % Math.ceil(points.length / 10) === 0 ||
                i === points.length - 1) && (
                <text
                  x={x + barW / 2}
                  y={h + 18}
                  fontSize="9"
                  textAnchor="middle"
                  fill="oklch(60% 0.03 250)"
                  className="font-mono"
                >
                  {p.day.slice(5)}
                </text>
              )}
            </g>
          );
        })}
        {/* Línea base */}
        <line
          x1={0}
          y1={h}
          x2={w}
          y2={h}
          stroke="oklch(85% 0.01 250)"
          strokeWidth="0.5"
        />
      </svg>
      <div className="mt-1 flex items-center gap-4 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2 w-2"
            style={{ backgroundColor: "oklch(70% 0.02 250)" }}
          />
          envíos
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2 w-2"
            style={{ backgroundColor: "oklch(55% 0.13 160)" }}
          />
          respuestas
        </span>
      </div>
    </div>
  );
}

function HealthBars({
  dist,
}: {
  dist: { total: number; green: number; yellow: number; red: number };
}) {
  if (dist.total === 0) {
    return (
      <p className="text-xs text-zinc-400">
        Padrón vacío. Cargá contactos en /padron.
      </p>
    );
  }
  const pct = (n: number) => Math.round((n / dist.total) * 100);
  return (
    <div className="space-y-2">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className="bg-emerald-500"
          style={{ width: `${(dist.green / dist.total) * 100}%` }}
        />
        <div
          className="bg-amber-500"
          style={{ width: `${(dist.yellow / dist.total) * 100}%` }}
        />
        <div
          className="bg-red-500"
          style={{ width: `${(dist.red / dist.total) * 100}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <span>
          🟢 sanas{" "}
          <strong className="font-mono">{dist.green.toLocaleString()}</strong>{" "}
          <span className="text-zinc-400">({pct(dist.green)}%)</span>
        </span>
        <span>
          🟡 tibias{" "}
          <strong className="font-mono">{dist.yellow.toLocaleString()}</strong>{" "}
          <span className="text-zinc-400">({pct(dist.yellow)}%)</span>
        </span>
        <span>
          🔴 deterioradas{" "}
          <strong className="font-mono">{dist.red.toLocaleString()}</strong>{" "}
          <span className="text-zinc-400">({pct(dist.red)}%)</span>
        </span>
      </div>
    </div>
  );
}
