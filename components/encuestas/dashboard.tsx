// Dashboard de monitoreo de una encuesta: totales + agregación por pregunta.
// Todo texto se renderiza como texto plano (respuestas no confiables).
import type { Encuesta, EncuestaResponse } from "@/lib/encuestas/types";
import { aggregate, type QuestionAgg } from "@/lib/encuestas/responses";

function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-2 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
      <div
        className="h-full rounded bg-[oklch(55%_0.12_240)]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ChoiceBlock({ agg }: { agg: Extract<QuestionAgg, { counts: unknown }> }) {
  return (
    <div className="space-y-1.5">
      {agg.counts.map((c) => (
        <div key={c.option} className="flex items-center gap-2 text-xs">
          <span className="w-32 shrink-0 truncate text-zinc-600 dark:text-zinc-300">
            {c.option}
          </span>
          <Bar pct={c.pct} />
          <span className="w-16 shrink-0 text-right font-mono text-zinc-500">
            {c.n} · {c.pct}%
          </span>
        </div>
      ))}
    </div>
  );
}

function ScaleBlock({ agg }: { agg: Extract<QuestionAgg, { type: "scale" }> }) {
  const maxN = Math.max(1, ...agg.distribution.map((d) => d.n));
  return (
    <div>
      <p className="mb-2 text-xs text-zinc-500">
        Promedio: <span className="font-mono font-medium">{agg.average.toFixed(2)}</span>{" "}
        ({agg.total} respuestas)
      </p>
      <div className="space-y-1.5">
        {agg.distribution.map((d) => (
          <div key={d.value} className="flex items-center gap-2 text-xs">
            <span className="w-6 shrink-0 text-right font-mono text-zinc-600 dark:text-zinc-300">
              {d.value}
            </span>
            <Bar pct={Math.round((d.n / maxN) * 100)} />
            <span className="w-10 shrink-0 text-right font-mono text-zinc-500">{d.n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TextBlock({ agg }: { agg: Extract<QuestionAgg, { type: "text" | "paragraph" }> }) {
  const shown = agg.values.slice(0, 50);
  return (
    <div className="space-y-1">
      <p className="text-xs text-zinc-500">{agg.total} respuestas</p>
      <ul className="max-h-60 space-y-1 overflow-y-auto rounded border border-zinc-100 p-2 dark:border-zinc-800">
        {shown.map((v, i) => (
          <li key={i} className="text-xs text-zinc-700 dark:text-zinc-300">
            • {v}
          </li>
        ))}
        {agg.values.length > shown.length && (
          <li className="text-xs text-zinc-400">
            …y {agg.values.length - shown.length} más (ver Sheet / CSV)
          </li>
        )}
      </ul>
    </div>
  );
}

export function EncuestaDashboard({
  encuesta,
  responses,
}: {
  encuesta: Encuesta;
  responses: EncuestaResponse[];
}) {
  const aggs = aggregate(encuesta, responses);
  const total = responses.length;
  const porEmail = responses.filter((r) => r.source === "email").length;
  const publicas = responses.filter((r) => r.source === "publica").length;

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Respuestas" value={total} />
        <Stat label="Por mail" value={porEmail} />
        <Stat label="Públicas" value={publicas} />
      </div>

      {total === 0 ? (
        <p className="rounded border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Todavía no hay respuestas.
        </p>
      ) : (
        <div className="space-y-5">
          {aggs.map((agg) => (
            <div
              key={agg.questionId}
              className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <h3 className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {agg.label}
              </h3>
              {"counts" in agg ? (
                <ChoiceBlock agg={agg} />
              ) : agg.type === "scale" ? (
                <ScaleBlock agg={agg} />
              ) : (
                <TextBlock agg={agg} />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 text-center dark:border-zinc-800">
      <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}
