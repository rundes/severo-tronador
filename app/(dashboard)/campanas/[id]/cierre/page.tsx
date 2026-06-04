import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaign } from "@/lib/campaigns";
import { analyzeCampaign } from "@/lib/analysis";
import { requireProject } from "@/lib/workspace";

export const metadata = { title: "Cierre · Severo Tronador" };

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export default async function CierrePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { id: projectId } = await requireProject();
  const campaign = await getCampaign(projectId, id);
  if (!campaign) notFound();
  const cierre = await analyzeCampaign(projectId, id);
  if (!cierre) notFound();

  const sentTotal =
    cierre.sentiment.positive +
    cierre.sentiment.negative +
    cierre.sentiment.neutral || 1;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/campanas/${id}`}
        className="text-sm text-zinc-500 hover:underline"
      >
        ← {campaign.nombre}
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Dashboard de cierre
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Análisis cualitativo de respuestas ·{" "}
          {cierre.mode === "mock" ? "heurística local (mock)" : "Claude API"}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg border border-zinc-200 py-3 dark:border-zinc-800">
          <div className="text-2xl font-semibold">{cierre.totalResponses}</div>
          <div className="text-xs text-zinc-400">respuestas</div>
        </div>
        <div className="rounded-lg border border-zinc-200 py-3 dark:border-zinc-800">
          <div className="text-2xl font-semibold">{cierre.totalSent}</div>
          <div className="text-xs text-zinc-400">enviados</div>
        </div>
        <div className="rounded-lg border border-zinc-200 py-3 dark:border-zinc-800">
          <div className="text-2xl font-semibold">
            {pct(cierre.responseRate)}
          </div>
          <div className="text-xs text-zinc-400">tasa de respuesta</div>
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
          Sentiment ({cierre.analyzed} respuestas abiertas)
        </div>
        <div className="flex h-3 overflow-hidden rounded">
          <div
            className="bg-emerald-500"
            style={{ width: pct(cierre.sentiment.positive / sentTotal) }}
          />
          <div
            className="bg-zinc-300 dark:bg-zinc-600"
            style={{ width: pct(cierre.sentiment.neutral / sentTotal) }}
          />
          <div
            className="bg-red-500"
            style={{ width: pct(cierre.sentiment.negative / sentTotal) }}
          />
        </div>
        <div className="mt-1 flex gap-4 text-xs text-zinc-500">
          <span>🟢 {cierre.sentiment.positive} positivas</span>
          <span>⚪ {cierre.sentiment.neutral} neutras</span>
          <span>🔴 {cierre.sentiment.negative} negativas</span>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
          Temas emergentes (coding inductivo)
        </div>
        {cierre.themes.length === 0 ? (
          <p className="text-sm text-zinc-400">
            Aún no hay suficientes respuestas para detectar temas.
          </p>
        ) : (
          <div className="space-y-2">
            {cierre.themes.map((t) => (
              <div
                key={t.label}
                className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{t.label}</span>
                  <span className="font-mono text-xs text-zinc-400">
                    {t.count} menciones
                  </span>
                </div>
                {t.examples.map((ex, i) => (
                  <p key={i} className="mt-1 text-xs text-zinc-500">
                    “{ex}”
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-zinc-400">
        El coding inductivo del mock usa frecuencia de términos. Con
        ANTHROPIC_API_KEY, el conector Claude hace coding temático real y
        valida contra la muestra (ver ARCHITECTURE §5b).
      </p>
    </div>
  );
}
