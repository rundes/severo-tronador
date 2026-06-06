import { requireProject } from "@/lib/workspace";
import { getMetaConfig, getInsights } from "@/lib/meta";
import { SubmitButton, FormStatus } from "@/components/ui/submit-button";
import { PostComposer } from "@/components/publicaciones/post-composer";
import {
  publicarPost,
  promocionarPost,
  generarContenidoPostIA,
  generarImagenIA,
} from "./actions";

export const metadata = { title: "Publicaciones · Tronador" };

const inputCls =
  "rounded border border-zinc-300 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export default async function PublicacionesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  await requireProject();
  const params = (await searchParams) ?? {};
  const cfg = await getMetaConfig();
  const ready = Boolean(cfg.token && cfg.pageId);
  const igReady = Boolean(cfg.token && cfg.igUserId);
  const adsReady = Boolean(cfg.token && cfg.adAccountId);

  const okMap: Record<string, string> = {
    publicado:
      `Publicación enviada${params.mode === "mock" ? " (modo mock, sin credenciales)" : ""}.` +
      (params.fb ? ` FB: ${params.fb}.` : "") +
      (params.ig ? ` IG: ${params.ig}.` : ""),
    promocionado:
      `Anuncio creado en estado PAUSADO${params.mode === "mock" ? " (mock)" : ""}` +
      (params.ad ? ` (${params.ad})` : "") +
      ". Activalo en el Administrador de anuncios de Meta cuando quieras que empiece a gastar.",
  };
  const errMap: Record<string, string> = {
    targets: "Elegí al menos un destino (Facebook o Instagram).",
    link: "El enlace debe empezar con http:// o https://.",
    fb_vacio: "Escribí un mensaje o subí una imagen para Facebook.",
    ig_img: "Instagram requiere una imagen.",
    fb: `No se pudo publicar en Facebook: ${params.detalle ?? ""}`,
    ig: `No se pudo publicar en Instagram: ${params.detalle ?? ""}`,
    promo_post: "Falta el ID del post a promocionar.",
    promo_datos: "Indicá presupuesto diario y cantidad de días (> 0).",
    promo: `No se pudo promocionar: ${params.detalle ?? ""}`,
  };
  const okMsg = params.ok ? okMap[params.ok] ?? null : null;
  const errMsg = params.error ? errMap[params.error] ?? "No se pudo completar." : null;

  // Reporte de rendimiento (cuando hay un id consultado).
  const rtype = params.rtype === "ad" ? "ad" : "post";
  const rid = (params.rid ?? "").trim();
  const insights = rid ? await getInsights(rtype, rid) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Publicaciones
        </h1>
        <p className="mt-1 max-w-[60ch] text-sm text-zinc-500">
          Publicá avisos y contenido en tu Página de Facebook e Instagram, y
          promocionalos con anuncios. La conexión se configura en{" "}
          <a href="/conectores" className="underline-offset-4 hover:underline">
            Conectores → Meta
          </a>
          .
        </p>
      </header>

      {!ready && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
          Falta configurar el conector <strong>Meta</strong> (Access Token + ID de
          Página). Mientras tanto, publicar corre en <strong>modo mock</strong>:
          no publica de verdad, solo simula el flujo.
        </div>
      )}

      <FormStatus ok={okMsg} error={errMsg} detalle={params.error ? params.detalle ?? null : null} />

      {/* ── Componer publicación (con asistente Gemini + preview) ────────── */}
      <section className="space-y-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          ✍️ Nueva publicación
        </h2>
        <PostComposer
          publishAction={publicarPost}
          aiAction={generarContenidoPostIA}
          imageAction={generarImagenIA}
          igReady={igReady}
          ready={ready}
        />
      </section>

      {/* ── Promocionar ───────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          🚀 Promocionar una publicación
        </h2>
        <p className="text-xs text-zinc-500">
          Crea un anuncio a partir de un post de la Página.{" "}
          <strong>Se crea PAUSADO</strong>: no gasta hasta que lo actives en el
          Administrador de anuncios de Meta.
          {!adsReady && " Falta la cuenta publicitaria en el conector (corre en mock)."}
        </p>
        <form action={promocionarPost} className="space-y-3">
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            ID del post de Facebook
            <input
              name="postId"
              required
              defaultValue={params.fb ?? ""}
              placeholder="1234567890_9876543210"
              className={`${inputCls} w-full font-mono`}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Presupuesto diario (USD)
              <input
                name="presupuesto"
                type="number"
                min={1}
                step={1}
                defaultValue={5}
                className={`${inputCls} w-32`}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Días
              <input
                name="dias"
                type="number"
                min={1}
                max={90}
                defaultValue={7}
                className={`${inputCls} w-24`}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              País (ISO-2)
              <input
                name="pais"
                defaultValue="AR"
                maxLength={2}
                className={`${inputCls} w-20 uppercase`}
              />
            </label>
          </div>
          <SubmitButton pendingLabel="Creando anuncio…" variant="secondary">
            Crear anuncio (pausado)
          </SubmitButton>
        </form>
      </section>

      {/* ── Reportes de rendimiento ───────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          📊 Reporte de rendimiento
        </h2>
        <p className="text-xs text-zinc-500">
          Consultá las métricas de una publicación o anuncio por su ID
          (impresiones, alcance, clics…). Volvé a consultar para actualizar.
        </p>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Tipo
            <select name="rtype" defaultValue={rtype} className={inputCls}>
              <option value="post">Publicación</option>
              <option value="ad">Anuncio</option>
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs text-zinc-500">
            ID
            <input
              name="rid"
              defaultValue={rid}
              placeholder="ID del post o del anuncio"
              className={`${inputCls} w-full font-mono`}
            />
          </label>
          <SubmitButton pendingLabel="Consultando…" variant="secondary">
            Ver métricas
          </SubmitButton>
        </form>

        {insights && (
          <div className="space-y-2">
            {insights.ok ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {insights.metrics.map((m) => (
                    <div
                      key={m.label}
                      className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                    >
                      <div className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                        {m.value.toLocaleString("es-AR")}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                        {m.label}
                      </div>
                    </div>
                  ))}
                </div>
                {insights.mode === "mock" && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    Datos de ejemplo (modo mock, sin credenciales de Meta).
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-red-600 dark:text-red-400">
                No se pudieron obtener métricas: {insights.error}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
