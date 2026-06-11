import Link from "next/link";
import { requireProject } from "@/lib/workspace";
import { getMetaConfig, getInsights } from "@/lib/meta";
import { SubmitButton, FormStatus } from "@/components/ui/submit-button";
import { DifusionBoard } from "@/components/publicaciones/difusion-board";
import { MetaAdComposer } from "@/components/publicaciones/meta-ad-composer";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import {
  promocionarPost,
  generarContenidoPostIA,
  generarImagenIA,
  publicarDirecto,
  sugerirMejorasAviso,
  cambiarEstadoAd,
  previsualizarPropuestaAd,
  crearAnuncioDesdePropuesta,
  listarCampaigns,
  listarAdsets,
} from "../publicaciones/actions";
import { listMyAds, getAdPreview, type DatePreset, type AdStatusFilter } from "@/lib/meta-ads";
import { MisAnuncios } from "@/components/publicaciones/mis-anuncios";
import { AdsReportTable } from "@/components/publicaciones/ads-report-table";

export const metadata = { title: "Difusión · Tronador" };

const inputCls =
  "rounded border border-zinc-300 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";

type Tab = "publicar" | "anuncios" | "reporte";

export default async function DifusionPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  await requireProject();
  const params = (await searchParams) ?? {};

  const rawTab = params.tab;
  const tab: Tab =
    rawTab === "anuncios" ? "anuncios" : rawTab === "reporte" ? "reporte" : "publicar";

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

  // Reporte
  const rtype = params.rtype === "ad" ? "ad" : "post";
  const rid = (params.rid ?? "").trim();
  const insights = tab === "reporte" && rid ? await getInsights(rtype, rid) : null;

  // Anuncios
  const datePreset: DatePreset = (["today", "yesterday", "last_7d", "last_30d", "maximum"] as const).includes(
    params.periodo as DatePreset,
  )
    ? (params.periodo as DatePreset)
    : "last_7d";
  const adStatus: AdStatusFilter = (["all", "active", "paused"] as const).includes(params.estado as AdStatusFilter)
    ? (params.estado as AdStatusFilter)
    : "all";
  const misAds = tab === "anuncios" ? await listMyAds({ datePreset, status: adStatus }) : [];
  // Tabla comparativa del reporte: todos los anuncios activos.
  const activeAds = tab === "reporte" ? await listMyAds({ datePreset, status: "active" }) : [];
  const adPreviews: Record<string, string> = {};
  if (tab === "anuncios") {
    await Promise.all(
      misAds.map(async (ad) => {
        const frames = await getAdPreview(ad.id, ["MOBILE_FEED_STANDARD"]);
        adPreviews[ad.id] = frames[0]?.html ?? "";
      }),
    );
  }

  const tabLinkCls = (active: boolean) =>
    `px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
      active
        ? "border-[oklch(52%_0.13_255)] text-[oklch(52%_0.13_255)]"
        : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
    }`;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Contenido"
        title="Difusión"
        subtitle={
          <>
            Publicá en Facebook e Instagram, promocioná con anuncios y medí el
            rendimiento. ¿Buscás crear contenido? Andá al{" "}
            <a href="/publicaciones" className="text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-300">
              Estudio de contenido
            </a>
            . Conexión en{" "}
            <a href="/conectores" className="underline-offset-4 hover:underline">
              Conectores → Meta
            </a>
            .
          </>
        }
        action={
          <a href="/publicaciones" className={buttonClass("secondary")}>
            ← Estudio de contenido
          </a>
        }
      />

      {!ready && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
          Falta configurar el conector <strong>Meta</strong> (Access Token + ID de
          Página). Mientras tanto, publicar corre en <strong>modo mock</strong>:
          no publica de verdad, solo simula el flujo.
        </div>
      )}

      <FormStatus ok={okMsg} error={errMsg} detalle={params.error ? params.detalle ?? null : null} />

      {/* ── Tab nav ────────────────────────────────────────────────────────── */}
      <nav
        aria-label="Secciones de difusión"
        className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800"
      >
        <Link href="/difusion?tab=publicar" className={tabLinkCls(tab === "publicar")}>
          Nueva publicación
        </Link>
        <Link href="/difusion?tab=anuncios" className={tabLinkCls(tab === "anuncios")}>
          Mis anuncios
        </Link>
        <Link href="/difusion?tab=reporte" className={tabLinkCls(tab === "reporte")}>
          Reporte de rendimiento
        </Link>
      </nav>

      {/* ── Pestaña: Nueva publicación ─────────────────────────────────────── */}
      {tab === "publicar" && (
        <div className="space-y-6">
          {/* Componer publicación orgánica */}
          <section className="space-y-3 rounded-lg border border-zinc-200 p-5 shadow-[var(--shadow-rest)] dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              Publicación orgánica (Facebook e Instagram)
            </h2>
            <p className="text-xs text-zinc-500">
              Compone y publicá directamente. La IA (Gemini / Claude) puede ayudarte con el texto y la imagen.
            </p>
            <DifusionBoard
              aiAction={generarContenidoPostIA}
              imageAction={generarImagenIA}
              publishAction={publicarDirecto}
              suggestAction={sugerirMejorasAviso}
              igReady={igReady}
              ready={ready}
            />
          </section>

          {/* Promocionar publicación existente */}
          <section className="space-y-3 rounded-lg border border-zinc-200 p-5 shadow-[var(--shadow-rest)] dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              Promocionar una publicación existente
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
                  <input name="presupuesto" type="number" min={1} step={1} defaultValue={5} className={`${inputCls} w-32`} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-zinc-500">
                  Días
                  <input name="dias" type="number" min={1} max={90} defaultValue={7} className={`${inputCls} w-24`} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-zinc-500">
                  País (ISO-2)
                  <input name="pais" defaultValue="AR" maxLength={2} className={`${inputCls} w-20 uppercase`} />
                </label>
              </div>
              <SubmitButton pendingLabel="Creando anuncio…" variant="secondary">
                Crear anuncio (pausado)
              </SubmitButton>
            </form>
          </section>

          {/* Compositor de anuncios Meta */}
          <section className="space-y-3 rounded-lg border border-zinc-200 p-5 shadow-[var(--shadow-rest)] dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              Anuncio Meta (generador de Meta)
            </h2>
            <p className="text-xs text-zinc-500">
              Escribí el copy, pegá una imagen o video, y usá el{" "}
              <strong>generador de previsualizaciones de Meta (Marketing API)</strong>{" "}
              para ver cómo queda en cada placement antes de publicar.
              {!adsReady && " Falta la cuenta publicitaria en el conector (corre en mock)."}
            </p>
            <MetaAdComposer
              previewAdAction={previsualizarPropuestaAd}
              crearAdAction={crearAnuncioDesdePropuesta}
              listCampaignsAction={listarCampaigns}
              listAdsetsAction={listarAdsets}
            />
          </section>
        </div>
      )}

      {/* ── Pestaña: Mis anuncios ──────────────────────────────────────────── */}
      {tab === "anuncios" && (
        <section className="space-y-3 rounded-lg border border-zinc-200 p-5 shadow-[var(--shadow-rest)] dark:border-zinc-800">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Mis anuncios</h2>
            <form method="get" className="flex flex-wrap items-end gap-2">
              {/* Preservar el tab activo al filtrar */}
              <input type="hidden" name="tab" value="anuncios" />
              <label className="flex flex-col gap-1 text-xs text-zinc-500">
                Período
                <select name="periodo" defaultValue={datePreset} className={inputCls}>
                  <option value="today">Hoy</option>
                  <option value="yesterday">Ayer</option>
                  <option value="last_7d">Últimos 7 días</option>
                  <option value="last_30d">Últimos 30 días</option>
                  <option value="maximum">Histórico</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-500">
                Estado
                <select name="estado" defaultValue={adStatus} className={inputCls}>
                  <option value="all">Todos</option>
                  <option value="active">Activos</option>
                  <option value="paused">Pausados</option>
                </select>
              </label>
              <button type="submit" className={buttonClass("secondary", "sm")}>
                Filtrar
              </button>
            </form>
          </div>
          {!adsReady && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Falta la cuenta publicitaria en el conector Meta — se muestran datos de ejemplo.
            </p>
          )}
          <MisAnuncios ads={misAds} previews={adPreviews} estadoAction={cambiarEstadoAd} />
        </section>
      )}

      {/* ── Pestaña: Reporte de rendimiento ───────────────────────────────── */}
      {tab === "reporte" && (
        <section className="space-y-3 rounded-lg border border-zinc-200 p-5 shadow-[var(--shadow-rest)] dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Reporte de rendimiento
          </h2>
          <p className="text-xs text-zinc-500">
            Consultá las métricas de una publicación o anuncio por su ID
            (impresiones, alcance, clics…). Volvé a consultar para actualizar.
          </p>
          <form method="get" className="flex flex-wrap items-end gap-3">
            {/* Preservar el tab activo al consultar */}
            <input type="hidden" name="tab" value="reporte" />
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Tipo
              <select name="rtype" defaultValue={rtype} className={inputCls}>
                <option value="post">Publicación</option>
                <option value="ad">Anuncio</option>
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs text-zinc-500">
              ID
              <input name="rid" defaultValue={rid} placeholder="ID del post o del anuncio" className={`${inputCls} w-full font-mono`} />
            </label>
            <SubmitButton pendingLabel="Consultando…" variant="secondary">
              Ver métricas
            </SubmitButton>
          </form>

          {insights && (
            <div className="space-y-2">
              {insights.ok ? (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                    {insights.metrics.map((m) => (
                      <div key={m.label} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                        <div className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                          {m.value.toLocaleString("es-AR")}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500">{m.label}</div>
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

          {/* Tabla comparativa de todos los anuncios activos */}
          <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  Comparar anuncios activos
                </h3>
                <p className="text-xs text-zinc-500">
                  Métricas de todos tus anuncios activos, lado a lado.
                </p>
              </div>
              <form method="get" className="flex items-end gap-2">
                <input type="hidden" name="tab" value="reporte" />
                <label className="flex flex-col gap-1 text-xs text-zinc-500">
                  Período
                  <select name="periodo" defaultValue={datePreset} className={inputCls}>
                    <option value="today">Hoy</option>
                    <option value="yesterday">Ayer</option>
                    <option value="last_7d">Últimos 7 días</option>
                    <option value="last_30d">Últimos 30 días</option>
                    <option value="maximum">Histórico</option>
                  </select>
                </label>
                <button type="submit" className={buttonClass("secondary", "sm")}>
                  Filtrar
                </button>
              </form>
            </div>
            <AdsReportTable ads={activeAds} />
          </div>
        </section>
      )}
    </div>
  );
}
