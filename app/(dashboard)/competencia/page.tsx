// Análisis de competencia vía Meta Ad Library: buscar anuncios públicos por
// palabra clave + rango de fechas y visualizar anunciante, texto, fechas y
// métricas (gasto/impresiones). URL-driven: la búsqueda vive en los
// searchParams (compartible). El creativo se abre en la ficha de Meta.
import { PageHeader } from "@/components/ui/page-header";
import {
  searchAdLibrary,
  type AdType,
  type AdActiveStatus,
  type AdLibAd,
} from "@/lib/meta-ad-library-search";

export const metadata = { title: "Competencia · Tronador" };

const inputCls =
  "min-h-11 rounded border border-zinc-300 bg-white px-2.5 py-1.5 text-base disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 sm:min-h-0 sm:text-sm";

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(+d)) return iso;
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function rangeLabel(r?: { lower?: string; upper?: string }): string | null {
  if (!r || (!r.lower && !r.upper)) return null;
  const lo = r.lower ? Number(r.lower).toLocaleString("es-AR") : "?";
  const hi = r.upper ? Number(r.upper).toLocaleString("es-AR") : "+";
  return `${lo}–${hi}`;
}

export default async function CompetenciaPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const q = (params.q ?? "").trim();
  const desde = params.desde ?? "";
  const hasta = params.hasta ?? "";
  const pais = (params.pais ?? "AR").toUpperCase().slice(0, 2);
  const tipo = (params.tipo as AdType) || "POLITICAL_AND_ISSUE_ADS";
  const estado = (params.estado as AdActiveStatus) || "ALL";

  const result = q
    ? await searchAdLibrary({
        terms: q,
        country: pais,
        dateMin: desde || undefined,
        dateMax: hasta || undefined,
        adType: tipo,
        activeStatus: estado,
        limit: 60,
      })
    : null;

  const ads: AdLibAd[] = result?.ok ? result.ads : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Investigación"
        title="Competencia"
        subtitle="Buscá anuncios públicos en la Meta Ad Library por palabra clave y rango de fechas. Análisis de pauta de la competencia."
      />

      {/* Buscador (GET → searchParams) */}
      <form
        method="get"
        className="grid grid-cols-2 gap-3 rounded-lg border border-zinc-200 p-5 shadow-[var(--shadow-rest)] dark:border-zinc-800 sm:grid-cols-3 lg:grid-cols-6"
      >
        <label className="col-span-2 flex flex-col gap-1 text-xs text-zinc-500 lg:col-span-2">
          Palabra clave / frase
          <input
            name="q"
            defaultValue={q}
            required
            placeholder="ej. obra pública"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Desde
          <input name="desde" type="date" defaultValue={desde} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Hasta
          <input name="hasta" type="date" defaultValue={hasta} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          País
          <input
            name="pais"
            defaultValue={pais}
            maxLength={2}
            className={`${inputCls} uppercase`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Tipo
          <select name="tipo" defaultValue={tipo} className={inputCls}>
            <option value="POLITICAL_AND_ISSUE_ADS">Político / issue</option>
            <option value="ALL">Todos los rubros</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Estado
          <select name="estado" defaultValue={estado} className={inputCls}>
            <option value="ALL">Todos</option>
            <option value="ACTIVE">Activos</option>
            <option value="INACTIVE">Inactivos</option>
          </select>
        </label>
        <div className="col-span-2 flex items-end sm:col-span-3 lg:col-span-6">
          <button
            type="submit"
            className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-strong"
          >
            Buscar anuncios
          </button>
        </div>
      </form>

      {/* Resultados */}
      {!q && (
        <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
          Ingresá una palabra clave para buscar. Solo trae anuncios
          político/issue con métricas (gasto, impresiones); &ldquo;Todos los
          rubros&rdquo; depende del país. El creativo se abre en la ficha de
          Meta.
        </p>
      )}

      {result && !result.ok && (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-400"
        >
          {result.error}
        </p>
      )}

      {result?.ok && (
        <>
          <p className="text-xs text-zinc-500">
            {ads.length === 0
              ? "Sin resultados para esa búsqueda."
              : `${ads.length} anuncio${ads.length === 1 ? "" : "s"} para «${q}» en ${pais}.`}
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ads.map((ad) => {
              const spend = rangeLabel(ad.spend);
              const impr = rangeLabel(ad.impressions);
              const aud = rangeLabel(ad.audience);
              return (
                <article
                  key={ad.id}
                  className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 shadow-[var(--shadow-rest)] dark:border-zinc-800"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                      {ad.pageName ?? "(anunciante desconocido)"}
                    </h3>
                  </div>
                  {ad.byline && (
                    <p className="text-[11px] text-zinc-500">
                      Financia: {ad.byline}
                    </p>
                  )}
                  {(ad.body || ad.title) && (
                    <p className="line-clamp-5 whitespace-pre-line text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                      {ad.body || ad.title}
                    </p>
                  )}

                  <dl className="mt-auto grid grid-cols-2 gap-x-3 gap-y-1 pt-1 text-[11px]">
                    <dt className="text-zinc-400">Inicio</dt>
                    <dd className="text-right font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                      {fmtDate(ad.startTime)}
                    </dd>
                    <dt className="text-zinc-400">Fin</dt>
                    <dd className="text-right font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                      {ad.stopTime ? fmtDate(ad.stopTime) : "activo"}
                    </dd>
                    {spend && (
                      <>
                        <dt className="text-zinc-400">Gasto {ad.currency ?? ""}</dt>
                        <dd className="text-right font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                          {spend}
                        </dd>
                      </>
                    )}
                    {impr && (
                      <>
                        <dt className="text-zinc-400">Impresiones</dt>
                        <dd className="text-right font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                          {impr}
                        </dd>
                      </>
                    )}
                    {aud && (
                      <>
                        <dt className="text-zinc-400">Audiencia est.</dt>
                        <dd className="text-right font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                          {aud}
                        </dd>
                      </>
                    )}
                  </dl>

                  {ad.platforms && ad.platforms.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {ad.platforms.map((p) => (
                        <span
                          key={p}
                          className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  )}

                  {ad.snapshotUrl && (
                    <a
                      href={ad.snapshotUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-accent underline-offset-4 hover:underline"
                    >
                      Ver creativo en Ad Library →
                    </a>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
