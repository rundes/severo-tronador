import Link from "next/link";
import { crearCampana } from "./actions";
import { outreachConnectorFor, OUTREACH_CHANNELS } from "@/lib/campaigns";
import { applySegment, filterFromParams, loadContacts } from "@/lib/segments";
import { channelAvailable, type Channel } from "@/lib/relationship";
import { listTemplates } from "@/lib/templates";

export const metadata = { title: "Nueva campaña · Severo Tronador" };

const inputCls =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

const CHANNEL_LABEL: Record<Channel, string> = {
  email: "📧 Email",
  whatsapp: "💬 WhatsApp",
  sms: "📱 SMS",
  voice: "☎️ Voz",
};

const ERROR_MSG: Record<string, string> = {
  no_template: "Elegí una plantilla.",
  no_connector: "No hay conector para ese canal.",
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
  const filter = filterFromParams(params);
  const all = await loadContacts();
  const matched = applySegment(all, filter);
  const sendable = matched.filter((m) => channelAvailable(m.rel, channel));

  const connector = outreachConnectorFor(channel)!;
  const quota = await connector.getQuota();
  const templates = await listTemplates(channel);

  const filterEntries = Object.entries(filter).filter(
    ([, v]) => v !== undefined,
  ) as [string, string | number][];

  // Query base (filtros) para los toggles de canal.
  const baseQs = new URLSearchParams(
    filterEntries.map(([k, v]) => [k, String(v)]),
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/campanas" className="text-sm text-zinc-500 hover:underline">
        ← Campañas
      </Link>
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
        Nueva campaña
      </h1>

      {/* Selector de canal */}
      <div className="flex gap-2">
        {OUTREACH_CHANNELS.map((ch) => {
          const qs = new URLSearchParams(baseQs);
          qs.set("channel", ch);
          const active = ch === channel;
          return (
            <Link
              key={ch}
              href={`/campanas/nueva?${qs}`}
              className={`rounded px-3 py-1.5 text-sm ${
                active
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-zinc-300 text-zinc-600 dark:border-zinc-700"
              }`}
            >
              {CHANNEL_LABEL[ch]}
            </Link>
          );
        })}
      </div>

      <div className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <div className="flex justify-between">
          <span className="text-zinc-500">Segmento</span>
          <span>
            {matched.length} personas · <strong>{sendable.length}</strong>{" "}
            contactables por {CHANNEL_LABEL[channel]} hoy
          </span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-zinc-500">Cuota {CHANNEL_LABEL[channel]}</span>
          <span className="font-mono">
            {quota.used}/{quota.limit} {quota.unit} · {quota.limit - quota.used}{" "}
            disponibles
          </span>
        </div>
        <div className="mt-2 text-xs text-zinc-400">
          Filtros:{" "}
          {filterEntries.length
            ? filterEntries.map(([k, v]) => `${k}=${v}`).join(" · ")
            : "ninguno (todo el padrón)"}
        </div>
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
          {ERROR_MSG[params.error]}
        </div>
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
          {filterEntries.map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={String(v)} />
          ))}

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
