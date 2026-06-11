import Link from "next/link";
import { crearCampanaMetaAd } from "../actions-meta-ad";
import { listSavedSegments } from "@/lib/segments-store";
import { loadContacts } from "@/lib/segments";
import { applySegment } from "@/lib/segments";
import { requireProject } from "@/lib/workspace";

export const metadata = { title: "Nueva campaña · Anuncio Meta · Severo Tronador" };

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus-visible:border-[oklch(52%_0.13_255)] focus-visible:ring-4 focus-visible:ring-[oklch(52%_0.13_255)]/12 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

const ERROR_MSG: Record<string, string> = {
  nombre_requerido: "El nombre de la campaña es obligatorio.",
  segmento_requerido: "Elegí un segmento guardado.",
  ad_id_requerido: "Ingresá el ID del anuncio de Meta.",
  db: "Error al guardar. Revisá la conexión a la base de datos.",
};

export default async function NuevaCampanaMetaAdPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const { id: projectId } = await requireProject();

  const segments = await listSavedSegments(projectId);

  // Precalcular tamaño del segmento seleccionado si viene en params.
  const preselectedSegmentId = params.segmentId ?? "";
  let segmentSize: number | null = null;
  if (preselectedSegmentId) {
    const seg = segments.find((s) => s.id === preselectedSegmentId);
    if (seg) {
      const all = await loadContacts(projectId);
      const matched = applySegment(all, seg.filtros);
      segmentSize = matched.length;
    }
  }

  const adSource = params.adSource ?? "vincular";
  const errorKey = params.error;
  const detalle = params.detalle;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/campanas" className="text-sm text-zinc-500 hover:underline">
        ← Campañas
      </Link>

      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">
          Nueva campaña
        </div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Anuncio Meta
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Asociá un anuncio de Meta a un segmento de tu padrón para medir el
          rendimiento del aviso frente a tu audiencia objetivo.
        </p>
      </div>

      {errorKey && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:border-red-800">
          <div>{ERROR_MSG[errorKey] ?? errorKey}</div>
          {detalle && (
            <div className="mt-1 font-mono text-xs text-red-600">{detalle}</div>
          )}
        </div>
      )}

      <form action={crearCampanaMetaAd} className="space-y-5">
        {/* Nombre */}
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Nombre de la campaña
          <input
            name="nombre"
            required
            placeholder="Aviso barrio norte — junio 2026"
            defaultValue={params.nombre ?? ""}
            className={inputCls}
          />
        </label>

        {/* Segmento guardado */}
        <div className="flex flex-col gap-1 text-xs text-zinc-500">
          <label htmlFor="segmentId">Segmento objetivo</label>
          {segments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
              No hay segmentos guardados aún.{" "}
              <Link href="/segmentos" className="underline">
                Creá uno en Segmentos
              </Link>{" "}
              y volvé acá.
            </div>
          ) : (
            <>
              <select
                id="segmentId"
                name="segmentId"
                required
                defaultValue={preselectedSegmentId}
                className={inputCls}
              >
                <option value="" disabled>
                  elegí un segmento…
                </option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
              {segmentSize !== null && (
                <span className="text-zinc-400">
                  Segmento seleccionado:{" "}
                  <span className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">
                    {segmentSize.toLocaleString("es-AR")}
                  </span>{" "}
                  personas en el padrón.
                </span>
              )}
            </>
          )}
        </div>

        {/* Origen del anuncio */}
        <div className="flex flex-col gap-2 text-xs text-zinc-500">
          <span className="font-medium">Origen del anuncio</span>
          <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <label className="flex items-start gap-3">
              <input
                type="radio"
                name="adSource"
                value="vincular"
                defaultChecked={adSource !== "crear"}
                className="mt-0.5 accent-[oklch(52%_0.13_255)]"
              />
              <div>
                <div className="font-medium text-zinc-700 dark:text-zinc-200">
                  Vincular aviso existente
                </div>
                <div className="mt-0.5 text-zinc-400">
                  Pegá el ID del anuncio que ya existe en tu cuenta de Meta.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="radio"
                name="adSource"
                value="crear"
                defaultChecked={adSource === "crear"}
                className="mt-0.5 accent-[oklch(52%_0.13_255)]"
              />
              <div>
                <div className="font-medium text-zinc-700 dark:text-zinc-200">
                  Crear desde Tronador
                </div>
                <div className="mt-0.5 text-zinc-400">
                  Usá el Estudio de difusión para diseñar y publicar el aviso,
                  luego copiá su ID y volvé a vincularlo.
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Panel de vinculación — visible siempre; la nota "crear" se muestra
            condicionalmente vía CSS (no hay JS en server component, así que
            mostramos ambos y dejamos el usuario elegir el flujo). */}
        <div className="rounded-xl border border-zinc-200 p-4 space-y-4 dark:border-zinc-800">
          <div className="flex flex-col gap-1 text-xs text-zinc-500">
            <label htmlFor="metaAdId">ID del anuncio (Meta Ad ID)</label>
            <input
              id="metaAdId"
              name="metaAdId"
              type="text"
              placeholder="120227…"
              defaultValue={params.metaAdId ?? ""}
              className={inputCls}
            />
            <span className="text-zinc-400">
              Lo encontrás en el Administrador de anuncios de Meta (columna
              «ID del anuncio»). Dejalo vacío si todavía no creaste el aviso.
            </span>
          </div>

          <div className="flex flex-col gap-1 text-xs text-zinc-500">
            <label htmlFor="metaAdsetId">
              ID del conjunto (Ad Set ID) — opcional
            </label>
            <input
              id="metaAdsetId"
              name="metaAdsetId"
              type="text"
              placeholder="120228…"
              defaultValue={params.metaAdsetId ?? ""}
              className={inputCls}
            />
          </div>

          <div className="flex flex-col gap-1 text-xs text-zinc-500">
            <label htmlFor="metaCampaignId">
              ID de la campaña Meta (Campaign ID) — opcional
            </label>
            <input
              id="metaCampaignId"
              name="metaCampaignId"
              type="text"
              placeholder="120229…"
              defaultValue={params.metaCampaignId ?? ""}
              className={inputCls}
            />
          </div>

          {/* Aviso "crear desde Tronador" */}
          <div className="rounded-lg border border-[oklch(90%_0.03_255)] bg-[oklch(97.5%_0.02_255)] p-3 text-xs text-zinc-600 dark:border-[oklch(40%_0.05_255)] dark:bg-[oklch(28%_0.04_255)] dark:text-zinc-300">
            <strong className="font-medium">¿Querés crear el aviso desde Tronador?</strong>{" "}
            Andá a{" "}
            <Link
              href="/difusion?tab=publicar"
              className="font-medium text-[oklch(52%_0.13_255)] underline hover:text-[oklch(47%_0.13_255)]"
            >
              Difusión → Publicar
            </Link>
            , diseñá el anuncio, copiá el ID que te devuelve el Estudio y
            pegalo en el campo «ID del anuncio» de arriba.
          </div>
        </div>

        <button
          type="submit"
          className="w-full rounded-lg bg-[oklch(52%_0.13_255)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[oklch(47%_0.13_255)] disabled:opacity-40"
        >
          Guardar campaña
        </button>
        <p className="text-xs text-zinc-400">
          La campaña se guarda sin envíos. Podés vincular el anuncio más tarde
          editando los IDs. Las métricas se leen en tiempo real desde Meta.
        </p>
      </form>
    </div>
  );
}
