import Link from "next/link";
import { listFlows } from "@/lib/flows";
import { borrarFlow, iniciarFlow } from "./actions";

export const metadata = { title: "Flows · Tronador" };

const ERROR_MSG: Record<string, string> = {
  no_flow: "Flow no encontrado.",
  no_steps: "Agregá al menos un step antes de iniciar.",
  already_running: "Este flow ya está corriendo.",
  no_db: "Necesita Supabase configurado para correr.",
  step_missing_template: "Algún step apunta a una plantilla inexistente.",
  step_no_connector: "Algún step tiene canal sin conector activo.",
};

const CONDITION_LABEL: Record<string, string> = {
  always: "siempre",
  if_no_response_to_prev: "si no respondió antes",
  if_response_to_prev: "si respondió antes",
};

const CHANNEL_ICON: Record<string, string> = {
  email: "📧",
  whatsapp: "💬",
  sms: "📱",
  voice: "☎️",
};

export default async function FlowsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const flows = await listFlows();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Drip flows
          </h1>
          <p className="mt-1 max-w-[60ch] text-sm text-zinc-500">
            Secuencias multi-step con delays y condiciones. Por ejemplo:
            invitación WhatsApp en día 0, si no respondió un recordatorio
            email en día 3, llamada en día 7.
          </p>
        </div>
        <Link
          href="/campanas/flows/nueva"
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          + Nuevo flow
        </Link>
      </header>

      {params.creado === "1" && (
        <Banner tone="emerald">Flow creado. Iniciá cuando esté listo.</Banner>
      )}
      {params.iniciado === "1" && (
        <Banner tone="emerald">
          Flow iniciado. El cron despacha cada step en su scheduled_at.
        </Banner>
      )}
      {params.error && ERROR_MSG[params.error] && (
        <Banner tone="red">{ERROR_MSG[params.error]}</Banner>
      )}

      {flows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Sin flows aún. Creá el primero para arrancar.
        </p>
      ) : (
        <ul className="space-y-3">
          {flows.map((flow) => (
            <li
              key={flow.id}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {flow.nombre}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {flow.steps.length} steps · estado{" "}
                    <span
                      className={
                        flow.estado === "running"
                          ? "text-emerald-600"
                          : flow.estado === "completed"
                            ? "text-zinc-500"
                            : "text-amber-600"
                      }
                    >
                      {flow.estado}
                    </span>
                    {flow.metrics.enqueued != null &&
                      ` · ${flow.metrics.enqueued} envíos encolados`}
                  </div>
                </div>
                <div className="flex gap-1">
                  {flow.estado === "draft" && (
                    <form action={iniciarFlow}>
                      <input type="hidden" name="id" value={flow.id} />
                      <button
                        type="submit"
                        className="rounded bg-emerald-700 px-3 py-1 text-xs text-white hover:bg-emerald-800"
                      >
                        Iniciar
                      </button>
                    </form>
                  )}
                  <form action={borrarFlow}>
                    <input type="hidden" name="id" value={flow.id} />
                    <button
                      type="submit"
                      className="rounded px-2 py-1 text-xs text-zinc-400 hover:text-red-600"
                      aria-label="Borrar"
                    >
                      ✕
                    </button>
                  </form>
                </div>
              </div>
              <ol className="mt-3 space-y-1 text-xs">
                {flow.steps.map((step) => (
                  <li
                    key={step.position}
                    className="flex items-center gap-3 text-zinc-600 dark:text-zinc-300"
                  >
                    <span className="font-mono text-zinc-400">
                      d+{step.delay_days}
                    </span>
                    <span>
                      {CHANNEL_ICON[step.channel] ?? "•"} {step.channel}
                    </span>
                    <span className="text-zinc-400">
                      · tpl {step.template_id}
                    </span>
                    <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                      {CONDITION_LABEL[step.condition_kind] ?? step.condition_kind}
                    </span>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "emerald" | "red";
  children: React.ReactNode;
}) {
  const cls =
    tone === "emerald"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
      : "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-200";
  return <div className={`rounded-lg border p-3 text-sm ${cls}`}>{children}</div>;
}
