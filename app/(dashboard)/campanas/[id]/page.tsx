import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getCampaign } from "@/lib/campaigns";
import { getTemplate } from "@/lib/templates";
import { listResponses } from "@/lib/survey";
import { campaignTracking } from "@/lib/tracking";
import { chiSquare2x2 } from "@/lib/ab-test";
import { requireProject } from "@/lib/workspace";
import { generarShareLink } from "./actions";
import { ShareLinkBox } from "@/components/campanas/share-link-box";
import { getInsights } from "@/lib/meta";
import { getAudienceStatus } from "@/lib/meta-custom-audiences";
import { getSavedSegment } from "@/lib/segments-store";
import { loadContacts, applySegment } from "@/lib/segments";
import { crearAudienciaSegmento } from "../nueva/actions-meta-ad";

export const metadata = { title: "Campaña · Severo Tronador" };

const ESTADO_META = {
  sent: { label: "enviado", cls: "text-emerald-600" },
  failed: { label: "fallido", cls: "text-red-600" },
  skipped: { label: "omitido", cls: "text-zinc-400" },
} as const;

const CHANNEL_LABEL: Record<string, string> = {
  email: "📧 Email",
  whatsapp: "💬 WhatsApp",
  sms: "📱 SMS",
  voice: "☎️ Voz",
  telegram: "✈️ Telegram",
  "meta-ad": "📣 Anuncio Meta",
};

const DELIVERY_LABEL: Record<string, string> = {
  delivered: "entregado",
  read: "leído",
  failed: "rebotó",
};

export default async function CampanaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const { id: projectId } = await requireProject();
  const sp = (await searchParams) ?? {};
  const campaign = await getCampaign(projectId, id);
  if (!campaign) notFound();

  // Si la action acabó de generar un share link, lo recibimos en ?shared=
  // + exp para mostrarlo en la UI con un copy button.
  let shareUrl: string | null = null;
  let shareExp: number | null = null;
  if (sp.shared) {
    const h = await headers();
    const proto = h.get("x-forwarded-proto") ?? "https";
    const host = h.get("host") ?? "tronador.net.ar";
    shareUrl = `${proto}://${host}/share/c/${sp.shared}`;
    shareExp = sp.exp ? Number(sp.exp) : null;
  }

  // ── Bifurcación: Anuncio Meta vs outreach normal ────────────────────────
  if (campaign.channel === "meta-ad") {
    // Datos específicos del panel Meta.
    // getInsights("ad", id) ya llama computeAdMetrics internamente y devuelve
    // Metric[]. No necesitamos re-computar: usamos adInsights.metrics directo.
    const adInsights = campaign.metaAdId
      ? await getInsights("ad", campaign.metaAdId)
      : null;

    // Segmento asociado.
    const savedSegment = campaign.segmentId
      ? await getSavedSegment(projectId, campaign.segmentId)
      : null;
    let segmentSize: number | null = null;
    if (savedSegment) {
      const all = await loadContacts(projectId);
      const matched = applySegment(all, savedSegment.filtros);
      segmentSize = matched.length;
    }

    // Alcance del anuncio (si está disponible en insights).
    const adReach = adInsights?.metrics.find((m) => m.label === "Alcance")?.value ?? null;
    const cobertura =
      adReach !== null && segmentSize && segmentSize > 0
        ? Math.round((adReach / segmentSize) * 100)
        : null;

    // Fase 2: estado de la Custom Audience (si ya se creó).
    const audStatus = campaign.metaAudienceId
      ? await getAudienceStatus(campaign.metaAudienceId)
      : null;

    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/campanas" className="text-sm text-zinc-500 hover:underline">
          ← Campañas
        </Link>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {campaign.nombre}
            </h1>
            <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-xs font-medium text-fuchsia-800 dark:bg-fuchsia-950/40 dark:text-fuchsia-300">
              Anuncio Meta
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Creada el {new Date(campaign.createdAt).toLocaleString("es-AR")}
            {campaign.metaAdId && (
              <>
                {" · "}
                <span className="font-mono text-xs">Ad ID: {campaign.metaAdId}</span>
              </>
            )}
          </p>
        </div>

        {shareUrl && shareExp && <ShareLinkBox url={shareUrl} exp={shareExp} />}

        {/* Segmento asociado */}
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">
            Segmento objetivo
          </div>
          {savedSegment ? (
            <div className="flex flex-wrap items-baseline gap-4">
              <div>
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {savedSegment.nombre}
                </div>
                {segmentSize !== null && (
                  <div className="mt-0.5 font-mono text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                    {segmentSize.toLocaleString("es-AR")}
                    <span className="ml-1 text-sm font-normal text-zinc-400">
                      personas en padrón
                    </span>
                  </div>
                )}
              </div>
              {cobertura !== null && (
                <div className="rounded-lg border border-[oklch(90%_0.03_255)] bg-[oklch(97.5%_0.02_255)] px-4 py-3 text-center dark:border-[oklch(40%_0.05_255)] dark:bg-[oklch(28%_0.04_255)]">
                  <div className="text-2xl font-semibold tabular-nums text-[oklch(45%_0.13_255)] dark:text-[oklch(82%_0.1_255)]">
                    {cobertura}%
                  </div>
                  <div className="text-xs text-zinc-500">cobertura</div>
                  <div className="text-[10px] text-zinc-400">
                    alcance Meta / tamaño segmento
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              Sin segmento asociado.{" "}
              <span className="text-zinc-400">
                Editá la campaña para vincular un segmento.
              </span>
            </p>
          )}
        </div>

        {/* Audiencia personalizada (Fase 2) */}
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">
              Audiencia personalizada (Meta)
            </div>
            {audStatus?.mode === "mock" && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                modo simulado
              </span>
            )}
          </div>

          {sp.aud_ok && (
            <p className="mb-3 text-sm text-emerald-700 dark:text-emerald-400">
              Audiencia creada: {sp.matched} de {sp.total} contactos con email/teléfono
              {sp.mode === "mock" ? " (simulado, sin credenciales de Meta)" : ""}.
            </p>
          )}
          {sp.aud_error && (
            <p className="mb-3 text-sm text-red-600 dark:text-red-400">
              No se pudo crear la audiencia:{" "}
              {sp.aud_error === "sin_segmento"
                ? "la campaña no tiene segmento asociado."
                : sp.aud_error === "no_db"
                  ? "Supabase no configurado."
                  : sp.aud_error}
            </p>
          )}

          {campaign.metaAudienceId ? (
            <div className="space-y-1">
              <div className="font-mono text-xs text-zinc-500">
                Audience ID: {campaign.metaAudienceId}
              </div>
              {audStatus?.ok && audStatus.mode === "live" && (
                <div className="text-sm text-zinc-700 dark:text-zinc-200">
                  ~{(audStatus.approximateCount ?? 0).toLocaleString("es-AR")} personas ·{" "}
                  <span className="text-zinc-500">{audStatus.status}</span>
                </div>
              )}
              <form action={crearAudienciaSegmento}>
                <input type="hidden" name="campaignId" value={campaign.id} />
                <button type="submit" className={buttonClass("secondary", "sm")}>
                  Resincronizar desde el segmento
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-zinc-500">
                Empujá el segmento como Custom Audience para que el anuncio pueda
                targetear a esa gente. Los emails/teléfonos se hashean (SHA-256)
                antes de salir de la app.
              </p>
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Requiere aceptar los Términos de Custom Audiences en tu Meta Business
                Manager. Sin eso, Meta rechaza la subida.
              </p>
              <form action={crearAudienciaSegmento}>
                <input type="hidden" name="campaignId" value={campaign.id} />
                <button
                  type="submit"
                  disabled={!campaign.segmentId}
                  className={buttonClass("primary", "sm")}
                >
                  Crear audiencia desde el segmento
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Panel de métricas del anuncio */}
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">
              Métricas del anuncio Meta
            </div>
            {adInsights?.mode === "mock" && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                modo simulado · configurá Meta en Conectores
              </span>
            )}
          </div>

          {!campaign.metaAdId ? (
            <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
              <p className="text-sm text-zinc-500">
                Esta campaña todavía no tiene un anuncio vinculado.
              </p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-zinc-400">
                Creá el aviso en{" "}
                <Link href="/difusion?tab=publicar" className="underline">
                  Difusión → Publicar
                </Link>{" "}
                o vinculá el ID de un anuncio existente desde el Administrador de Meta.
              </p>
            </div>
          ) : adInsights ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {adInsights.metrics.map((m) => (
                <div
                  key={m.label}
                  className="rounded-lg border border-zinc-200 px-3 py-3 text-center dark:border-zinc-800"
                >
                  <div className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                    {typeof m.value === "number" && !Number.isInteger(m.value)
                      ? m.value.toFixed(2)
                      : m.value.toLocaleString("es-AR")}
                  </div>
                  <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                    {m.label}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              No se pudieron cargar las métricas del anuncio.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Outreach campaign (email / whatsapp / sms / voice / telegram) ────────
  const template = await getTemplate(campaign.templateId);
  const { metrics } = campaign;
  const respuestasList = await listResponses(projectId, campaign.id);
  const respuestas = respuestasList.length;
  const tracking = await campaignTracking(projectId, campaign.id);
  const openRate =
    metrics.sent > 0 ? tracking.openedRecipients / metrics.sent : 0;

  // A/B testing: agrupar envíos por variante + resolver respuestas (los
  // tokens de los envíos están en respuestasList).
  const responseTokens = new Set(respuestasList.map((r) => r.token));
  const variantBreakdown = campaign.variants.length >= 2
    ? campaign.variants.map((v) => {
        const enviosV = campaign.envios.filter((e) => e.variantId === v.id && e.estado === "sent");
        const respV = enviosV.filter((e) => e.token && responseTokens.has(e.token)).length;
        return {
          ...v,
          sent: enviosV.length,
          responses: respV,
          responseRate: enviosV.length > 0 ? respV / enviosV.length : 0,
        };
      })
    : [];

  // Significance test sobre las primeras dos variantes (la UI MVP solo
  // soporta A/B; multi-variant chi² requiere df > 1).
  const sig = variantBreakdown.length >= 2
    ? chiSquare2x2(
        { sent: variantBreakdown[0].sent, responses: variantBreakdown[0].responses },
        { sent: variantBreakdown[1].sent, responses: variantBreakdown[1].responses },
      )
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/campanas" className="text-sm text-zinc-500 hover:underline">
        ← Campañas
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          {campaign.nombre}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {CHANNEL_LABEL[campaign.channel] ?? campaign.channel} · plantilla «
          {template?.nombre ?? campaign.templateId}» ·{" "}
          {new Date(campaign.createdAt).toLocaleString("es-AR")} ·{" "}
          <Link href="/respuestas" className="hover:underline">
            {respuestas} respuestas
          </Link>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            href={`/campanas/${campaign.id}/cierre`}
            className={buttonClass("primary")}
          >
            Ver dashboard de cierre →
          </Link>
          <a
            href={`/api/campanas/${campaign.id}/pdf`}
            className="inline-flex items-center gap-1.5 rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            ⬇️ PDF
          </a>
          <form
            action={generarShareLink}
            className="inline-flex items-center gap-1 rounded border border-zinc-300 p-0.5 dark:border-zinc-700"
          >
            <input type="hidden" name="id" value={campaign.id} />
            <select
              name="duracion"
              defaultValue="week"
              className="rounded px-1.5 py-1 text-xs bg-transparent text-zinc-700 focus:outline-none dark:text-zinc-200"
            >
              <option value="day">1d</option>
              <option value="week">7d</option>
              <option value="month">30d</option>
            </select>
            <button
              type="submit"
              className="rounded px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              🔗 Compartir
            </button>
          </form>
        </div>
      </div>

      {shareUrl && shareExp && <ShareLinkBox url={shareUrl} exp={shareExp} />}

      <div className="grid grid-cols-4 gap-3 text-center">
        {[
          { label: "Total", n: metrics.total, cls: "text-zinc-900 dark:text-zinc-100" },
          { label: "Enviados", n: metrics.sent, cls: "text-emerald-600" },
          { label: "Omitidos", n: metrics.skipped, cls: "text-zinc-500" },
          { label: "Fallidos", n: metrics.failed, cls: "text-red-600" },
        ].map((m) => (
          <div
            key={m.label}
            className="rounded-lg border border-zinc-200 py-3 dark:border-zinc-800"
          >
            <div className={`text-2xl font-semibold ${m.cls}`}>{m.n}</div>
            <div className="text-xs text-zinc-400">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Tracking de email: aperturas + clicks (solo canal email). */}
      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          {
            label: "Aperturas",
            n: tracking.openedRecipients,
            sub: metrics.sent > 0 ? `${Math.round(openRate * 100)}%` : "—",
            cls: "text-sky-600",
          },
          { label: "Aperturas totales", n: tracking.opens, sub: "incl. repetidas", cls: "text-sky-500" },
          { label: "Clicks", n: tracking.clicks, sub: "links rastreados", cls: "text-violet-600" },
        ].map((m) => (
          <div
            key={m.label}
            className="rounded-lg border border-zinc-200 py-3 dark:border-zinc-800"
          >
            <div className={`text-2xl font-semibold ${m.cls}`}>{m.n}</div>
            <div className="text-xs text-zinc-400">{m.label}</div>
            <div className="text-[10px] text-zinc-400">{m.sub}</div>
          </div>
        ))}
      </div>

      {variantBreakdown.length >= 2 && (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
              A/B testing
            </h2>
            {sig && !sig.sampleTooSmall && (
              <span className={`font-mono text-[10px] uppercase tracking-wider ${
                sig.significant ? "text-emerald-600" : "text-zinc-400"
              }`}>
                χ²={sig.chi2.toFixed(2)} · p={sig.pValue.toFixed(3)} · {
                  sig.significant ? "significativo" : "no significativo"
                }
              </span>
            )}
            {sig?.sampleTooSmall && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-amber-600">
                muestra muy chica para significance test
              </span>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-[10px] uppercase tracking-wider text-zinc-500 dark:bg-zinc-900/40">
                <tr>
                  <th className="px-3 py-2 font-medium">Variante</th>
                  <th className="px-3 py-2 font-medium">Template</th>
                  <th className="px-3 py-2 font-medium">Peso</th>
                  <th className="px-3 py-2 font-medium text-right">Sent</th>
                  <th className="px-3 py-2 font-medium text-right">Resp</th>
                  <th className="px-3 py-2 font-medium text-right">RR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {variantBreakdown.map((v, i) => {
                  const winner = sig?.significant && i === 0 && variantBreakdown[0].responseRate > variantBreakdown[1].responseRate ||
                                 sig?.significant && i === 1 && variantBreakdown[1].responseRate > variantBreakdown[0].responseRate;
                  return (
                    <tr key={v.id} className={winner ? "bg-emerald-50/50 dark:bg-emerald-950/20" : ""}>
                      <td className="px-3 py-2 font-mono text-xs">
                        {v.id} {v.label && <span className="text-zinc-500">· {v.label}</span>}
                        {winner && <span className="ml-1 text-emerald-600">✓ ganadora</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-500">{v.template_id}</td>
                      <td className="px-3 py-2 font-mono text-xs text-zinc-500">{v.weight}</td>
                      <td className="px-3 py-2 text-right font-mono">{v.sent}</td>
                      <td className="px-3 py-2 text-right font-mono">{v.responses}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {(v.responseRate * 100).toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
          Envíos
        </div>
        <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
          {campaign.envios.map((e) => {
            const meta = ESTADO_META[e.estado];
            return (
              <div
                key={e.dni}
                className="flex items-center justify-between px-4 py-2"
              >
                <Link
                  href={`/contactos/${e.dni}`}
                  className="hover:underline"
                >
                  {e.nombre}{" "}
                  <span className="text-zinc-400">{e.destino}</span>
                </Link>
                <span className={meta.cls}>
                  {meta.label}
                  {e.delivery && (
                    <span className="ml-1 text-xs text-zinc-500">
                      · {DELIVERY_LABEL[e.delivery] ?? e.delivery}
                    </span>
                  )}
                  {e.reason && (
                    <span className="ml-1 text-xs text-zinc-400">
                      ({e.reason})
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
