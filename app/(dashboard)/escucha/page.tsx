import Link from "next/link";
import { runListening } from "@/lib/listening";

export const metadata = { title: "Escucha · Severo Tronador" };

const SOURCE_LABEL: Record<string, string> = {
  gdelt: "📰 GDELT",
  "x-api": "𝕏 X",
  "reddit-api": "👽 Reddit",
};

export default async function EscuchaPage() {
  const { totalItems, bySource, topics } = await runListening();
  const emerging = topics.filter((t) => t.emerging);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Escucha
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Canal pasivo: qué se dice de Maipú en prensa y redes. Descubre temas{" "}
          <em>antes</em> de diseñar una encuesta.
        </p>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <span className="text-zinc-500">{totalItems} menciones</span>
        {Object.entries(bySource).map(([s, n]) => (
          <span key={s}>
            {SOURCE_LABEL[s] ?? s}: {n}
          </span>
        ))}
      </div>

      {emerging.length > 0 && (
        <div className="space-y-2">
          {emerging.map((t) => (
            <div
              key={t.label}
              className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 p-4 dark:bg-amber-950/30"
            >
              <div>
                <div className="text-sm font-medium text-amber-900 dark:text-amber-200">
                  ⚠️ Tema emergente: <strong>{t.label}</strong>
                </div>
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  {t.recent} menciones esta semana vs {t.prior} la previa.
                </div>
              </div>
              <Link
                href={`/campanas/nueva?tema=${encodeURIComponent(t.label)}`}
                className="shrink-0 rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Diseñar encuesta →
              </Link>
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
          Temas detectados (semana vs baseline)
        </div>
        <div className="space-y-2">
          {topics.map((t) => (
            <div
              key={t.label}
              className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {t.label}
                  {t.emerging && <span className="ml-2 text-amber-600">⚠️</span>}
                </span>
                <span className="font-mono text-xs text-zinc-400">
                  {t.recent} esta semana · {t.prior} previa
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
      </div>

      <p className="text-xs text-zinc-400">
        Mock: GDELT/X/Reddit simulados. Con credenciales, los conectores de
        listening traen menciones reales geo-filtradas a Maipú (BA).
      </p>
    </div>
  );
}
