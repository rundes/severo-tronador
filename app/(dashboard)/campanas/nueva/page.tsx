import Link from "next/link";
import { crearCampana } from "./actions";
import { outreachConnectorFor, OUTREACH_CHANNELS } from "@/lib/campaigns";
import { applySegment, filterFromParams, loadContacts } from "@/lib/segments";
import { applyQuery, decodeQuery } from "@/lib/segment-query";
import { channelAvailable, type Channel } from "@/lib/relationship";
import { listTemplates, getTemplate } from "@/lib/templates";
import { requireProject } from "@/lib/workspace";
import { ChannelPreview } from "@/components/segmentos/channel-preview";

export const metadata = { title: "Nueva campaña · Severo Tronador" };

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus-visible:border-[oklch(52%_0.13_255)] focus-visible:ring-4 focus-visible:ring-[oklch(52%_0.13_255)]/12 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

const CHANNEL_LABEL: Record<Channel, string> = {
  email: "📧 Email",
  whatsapp: "💬 WhatsApp",
  sms: "📱 SMS",
  voice: "☎️ Voz", telegram: "✈️ Telegram",
};

const ERROR_MSG: Record<string, string> = {
  no_template: "Elegí una plantilla.",
  no_connector: "No hay conector para ese canal.",
  validacion: "Datos inválidos. Revisá los campos.",
};

export default async function NuevaCampanaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const channel: Channel =
    params.channel && OUTREACH_CHANNELS.includes(params.channel as Channel)
      ? (params.channel as Channel)
      : "email";
  const { id: projectId } = await requireProject();
  const advancedQuery = params.q ? decodeQuery(params.q) : null;
  const filter = advancedQuery ? {} : filterFromParams(params);
  const all = await loadContacts(projectId);
  const matched = advancedQuery
    ? applyQuery(all, advancedQuery)
    : applySegment(all, filter);
  const sendable = matched.filter((m) => channelAvailable(m.rel, channel));

  const connector = outreachConnectorFor(channel)!;
  const quota = await connector.getQuota();
  const templates = await listTemplates(channel);
  // Preview por canal: leemos la plantilla preseleccionada vía
  // params.templateId (mismo nombre que el select) — si no hay seleccionada
  // usamos la primera disponible para mostrar algo accionable.
  const previewTemplateId = params.templateId || templates[0]?.id;
  const previewTemplate = previewTemplateId
    ? await getTemplate(previewTemplateId)
    : null;

  const filterEntries = Object.entries(filter).filter(
    ([, v]) => v !== undefined,
  ) as [string, string | number][];

  // Query base (filtros o q) para los toggles de canal.
  const baseQs = new URLSearchParams(
    filterEntries.map(([k, v]) => [k, String(v)]),
  );
  if (params.q) baseQs.set("q", params.q);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/campanas" className="text-sm text-zinc-500 hover:underline">
        ← Campañas
      </Link>
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
        Nueva campaña
      </h1>

      {/* Canal — control segmentado */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-zinc-200 p-1 dark:border-zinc-800">
        {OUTREACH_CHANNELS.map((ch) => {
          const qs = new URLSearchParams(baseQs);
          qs.set("channel", ch);
          const active = ch === channel;
          return (
            <Link
              key={ch}
              href={`/campanas/nueva?${qs}`}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "bg-[oklch(52%_0.13_255)] text-white"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {CHANNEL_LABEL[ch]}
            </Link>
          );
        })}
      </div>

      {/* Resumen del envío */}
      <div>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="En el segmento" value={matched.length} />
          <Stat label="Contactables hoy" value={sendable.length} accent />
          <Stat
            label="Cuota disponible"
            value={quota.limit - quota.used}
            sub={`${quota.used}/${quota.limit} ${quota.unit}`}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          {advancedQuery
            ? "Filtros: query avanzada (AND/OR/NOT) — editá en /segmentos."
            : `Filtros: ${
                filterEntries.length
                  ? filterEntries.map(([k, v]) => `${k}=${v}`).join(" · ")
                  : "ninguno (todo el padrón)"
              }`}
        </p>
      </div>

      {params.error === "quota_blocked" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950/30">
          <strong>Esta campaña no entra en tu cuota.</strong> Necesita{" "}
          {params.needed} envíos y quedan {params.remaining} antes del reset
          mensual. Recortá el segmento o esperá el reset. No hay opción de
          mandar igual.
        </div>
      )}
      {params.error && ERROR_MSG[params.error] && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30">
          <div>{ERROR_MSG[params.error]}</div>
          {params.detalle && (
            <div className="mt-1 font-mono text-xs text-red-600">
              {params.detalle}
            </div>
          )}
        </div>
      )}

      {previewTemplate && (
        <ChannelPreview
          channel={channel}
          template={{ asunto: previewTemplate.asunto, cuerpo: previewTemplate.cuerpo }}
        />
      )}

      {templates.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
          No hay plantillas para {CHANNEL_LABEL[channel]}.{" "}
          <Link href="/templates" className="underline">
            Creá una
          </Link>
          .
        </p>
      ) : (
        <form action={crearCampana} className="space-y-4">
          <input type="hidden" name="channel" value={channel} />
          {advancedQuery ? (
            <input type="hidden" name="q" value={params.q ?? ""} />
          ) : (
            filterEntries.map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={String(v)} />
            ))
          )}

          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Nombre de la campaña
            <input
              name="nombre"
              required
              placeholder="Sondeo transporte — Centro"
              defaultValue={params.nombre ?? ""}
              className={inputCls}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Plantilla ({CHANNEL_LABEL[channel]})
            <select
              name="templateId"
              required
              className={inputCls}
              defaultValue=""
            >
              <option value="" disabled>
                elegí una plantilla…
              </option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </label>

          <details className="rounded-lg border border-dashed border-zinc-300 p-3 text-xs dark:border-zinc-700">
            <summary className="cursor-pointer font-medium uppercase tracking-[0.18em] text-zinc-500">
              A/B testing (opcional)
            </summary>
            <div className="mt-3 space-y-3">
              <p className="text-zinc-500">
                Activá la variante B con otra plantilla. Los destinatarios se
                reparten determinísticamente por hash de DNI; el mismo contacto
                cae siempre en la misma variante.
              </p>
              <label className="flex flex-col gap-1 text-zinc-500">
                Plantilla variante B
                <select
                  name="variant_b_template"
                  defaultValue=""
                  className={inputCls}
                >
                  <option value="">— sin A/B —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-zinc-500">
                  Peso A (%)
                  <input
                    type="number"
                    name="variant_a_weight"
                    min={1}
                    max={99}
                    defaultValue={50}
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1 text-zinc-500">
                  Peso B (%)
                  <input
                    type="number"
                    name="variant_b_weight"
                    min={1}
                    max={99}
                    defaultValue={50}
                    className={inputCls}
                  />
                </label>
              </div>
            </div>
          </details>

          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Preguntas de la encuesta (una por línea)
            <textarea
              name="preguntas"
              rows={3}
              placeholder="¿Qué mejorarías de tu barrio?&#10;¿Cómo calificás el transporte? (1-5)"
              defaultValue={
                params.tema
                  ? `¿Qué opinás sobre ${params.tema} en tu barrio?`
                  : ""
              }
              className={inputCls}
            />
            <span className="text-zinc-400">
              Si dejás esto vacío, se usa una pregunta por defecto. Incluí{" "}
              <code>{"{{encuesta_url}}"}</code> en la plantilla para enlazar la
              encuesta.
            </span>
          </label>

          <button
            type="submit"
            disabled={sendable.length === 0}
            className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Ejecutar envío a {sendable.length} →
          </button>
          <p className="text-xs text-zinc-400">
            Sin credenciales del canal, el envío se simula (modo mock) y consume
            cuota igual, para probar el flujo completo.
          </p>
        </form>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        accent
          ? "border-[oklch(90%_0.03_255)] bg-[oklch(97.5%_0.02_255)] dark:border-[oklch(40%_0.05_255)] dark:bg-[oklch(28%_0.04_255)]"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div
        className={`text-2xl font-semibold tabular-nums ${
          accent
            ? "text-[oklch(45%_0.13_255)] dark:text-[oklch(82%_0.1_255)]"
            : "text-zinc-900 dark:text-zinc-100"
        }`}
      >
        {value.toLocaleString("es-AR")}
      </div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      {sub && <div className="mt-0.5 font-mono text-[11px] text-zinc-400">{sub}</div>}
    </div>
  );
}
