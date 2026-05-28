import Link from "next/link";
import { runListening } from "@/lib/listening";
import { TERRITORY } from "@/lib/config";
import { getListeningConfig } from "@/lib/listening-config";
import { guardarEscucha } from "./actions";

export const metadata = { title: "Escucha · Severo Tronador" };

const SOURCE_LABEL: Record<string, string> = {
  gdelt: "📰 GDELT",
  "x-api": "𝕏 X",
  "reddit-api": "👽 Reddit",
};

const inputCls =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

const FUENTES = [
  { id: "gdelt", label: "📰 GDELT" },
  { id: "x-api", label: "𝕏 X" },
  { id: "reddit-api", label: "👽 Reddit" },
];

export default async function EscuchaPage() {
  const [{ totalItems, bySource, topics }, cfg] = await Promise.all([
    runListening(),
    getListeningConfig(),
  ]);
  const emerging = topics.filter((t) => t.emerging);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Escucha
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Canal pasivo: qué se dice de {TERRITORY} en prensa y redes. Descubre
          temas <em>antes</em> de diseñar una encuesta.
        </p>
      </div>

      <form action={guardarEscucha} className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="text-sm font-medium">Configurar escucha</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-zinc-500">Zona
            <input name="zona" defaultValue={cfg.zona} placeholder="ej: La Plata" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">País
            <input name="pais" defaultValue={cfg.pais} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">Radio (km, opcional)
            <input name="radioKm" type="number" defaultValue={cfg.radioKm ?? ""} className={inputCls} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">Keywords (una por línea)
          <textarea name="keywords" rows={3} defaultValue={cfg.keywords.join("\n")} className={inputCls} />
        </label>
        <div className="flex flex-wrap gap-3 text-sm">
          {FUENTES.map((f) => (
            <label key={f.id} className="flex items-center gap-1">
              <input
                type="checkbox"
                name="fuentes"
                value={f.id}
                defaultChecked={cfg.fuentes.length === 0 || cfg.fuentes.includes(f.id)}
              />
              {f.label}
            </label>
          ))}
        </div>
        <button type="submit" className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
          Guardar escucha
        </button>
        <p className="text-xs text-zinc-400">
          Sin Supabase configurado, guardar avisa el error; la escucha corre con el default (todo el mock).
        </p>
      </form>

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
        listening traen menciones reales geo-filtradas a tu territorio.
      </p>
    </div>
  );
}
