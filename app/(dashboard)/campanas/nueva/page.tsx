import Link from "next/link";
import { crearCampana } from "./actions";
import { resendConnector } from "@/lib/connectors/resend";
import { applySegment, filterFromParams, loadContacts } from "@/lib/segments";
import { channelAvailable } from "@/lib/relationship";
import { listTemplates } from "@/lib/templates";

export const metadata = { title: "Nueva campaña · Severo Tronador" };

const inputCls =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

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
  const filter = filterFromParams(params);
  const all = await loadContacts();
  const matched = applySegment(all, filter);
  const sendable = matched.filter((m) => channelAvailable(m.rel, "email"));
  const quota = await resendConnector.getQuota();
  const templates = listTemplates("email");

  const filterEntries = Object.entries(filter).filter(
    ([, v]) => v !== undefined,
  ) as [string, string | number][];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/campanas" className="text-sm text-zinc-500 hover:underline">
        ← Campañas
      </Link>
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
        Nueva campaña
      </h1>

      <div className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <div className="flex justify-between">
          <span className="text-zinc-500">Segmento</span>
          <span>
            {matched.length} personas ·{" "}
            <strong>{sendable.length}</strong> contactables por email hoy
          </span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-zinc-500">Cuota email (Resend)</span>
          <span className="font-mono">
            {quota.used}/{quota.limit} usados · {quota.limit - quota.used}{" "}
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
          mensual. Recortá el segmento (subí la salud mínima o achicá el barrio)
          o esperá el reset. No hay opción de mandar igual.
        </div>
      )}
      {params.error && ERROR_MSG[params.error] && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30">
          {ERROR_MSG[params.error]}
        </div>
      )}

      <form action={crearCampana} className="space-y-4">
        {/* el segmento viaja en hidden inputs */}
        {filterEntries.map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={String(v)} />
        ))}

        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Nombre de la campaña
          <input
            name="nombre"
            required
            placeholder="Sondeo transporte — Las Armas"
            defaultValue={params.nombre ?? ""}
            className={inputCls}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Plantilla (email)
          <select name="templateId" required className={inputCls} defaultValue="">
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

        <button
          type="submit"
          disabled={sendable.length === 0}
          className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Ejecutar envío a {sendable.length} →
        </button>
        <p className="text-xs text-zinc-400">
          Sin API key de Resend, el envío se simula (modo mock) y consume cuota
          igual, para probar el flujo completo.
        </p>
      </form>
    </div>
  );
}
