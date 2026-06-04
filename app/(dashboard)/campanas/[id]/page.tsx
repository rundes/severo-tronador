import Link from "next/link";
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
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/campanas" className="text-sm text-zinc-500 hover:underline">
        ← Campañas
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          {campaign.nombre}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {CHANNEL_LABEL[campaign.channel] ?? campaign.channel} · plantilla “
          {template?.nombre ?? campaign.templateId}” ·{" "}
          {new Date(campaign.createdAt).toLocaleString("es-AR")} ·{" "}
          <Link href="/respuestas" className="hover:underline">
            {respuestas} respuestas
          </Link>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            href={`/campanas/${campaign.id}/cierre`}
            className="inline-block rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
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
