import { nuevaPlantilla } from "./actions";
import { listTemplates, templateVars } from "@/lib/templates";
import { SUPPORTED_VARS, buildVarMap } from "@/lib/interpolate-vars";
import { loadContacts } from "@/lib/segments";
import { TemplateEditor } from "@/components/templates/template-editor";
import type { Contact } from "@/lib/connectors/types";

export const metadata = { title: "Plantillas · Tronador" };

const CHANNEL_ICON: Record<string, string> = {
  email: "📧",
  whatsapp: "💬",
  sms: "📱",
  voice: "☎️",
};

// Contacto de muestra para que el preview tenga datos reales si el padrón
// está cargado, sino un demo razonable.
const DEMO_CONTACT: Contact = {
  dni: "demo",
  nombre: "María",
  apellido: "González",
  barrio: "Centro",
  circuito: "12",
  mesa: "0034",
  email: "maria@example.com",
  telefono: "+5491155555555",
};

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const templates = await listTemplates();

  // Sample contact para el preview. Tomamos el primero del padrón para
  // mantener el render puro (sin Math.random/Date.now de regla react/purity).
  let sample: Contact = DEMO_CONTACT;
  try {
    const all = await loadContacts();
    if (all.length > 0) sample = all[0].contact;
  } catch {
    // Fallback al demo si el padrón no carga.
  }
  const sampleLabel =
    `${sample.nombre ?? ""} ${sample.apellido ?? ""}`.trim() || "demo";

  // now anclado al día actual a mediodía UTC (estable dentro de un mismo día).
  const now = new Date();
  now.setUTCHours(12, 0, 0, 0);
  const varMap = buildVarMap(sample, {
    now: now.getTime(),
    surveyUrl: "https://tronador.net.ar/encuesta/abc123",
  });

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Plantillas
        </h1>
        <p className="mt-1 max-w-[60ch] text-sm text-zinc-500">
          Mensajes por canal con variables. Editor con preview lado a lado,
          autocomplete y validación.
        </p>
      </header>

      <details className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <summary className="cursor-pointer text-xs font-medium uppercase tracking-[0.18em] text-zinc-500 hover:text-zinc-700">
          Variables disponibles ({SUPPORTED_VARS.length})
        </summary>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {SUPPORTED_VARS.map((v) => (
            <div key={v.key} className="flex items-baseline gap-2 text-sm">
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {`{{${v.key}}}`}
              </code>
              <span className="text-xs text-zinc-500">{v.desc}</span>
            </div>
          ))}
        </dl>
      </details>

      {/* Nueva plantilla — editor rich */}
      <section className="rounded-lg border border-dashed border-zinc-300 p-5 dark:border-zinc-700">
        <h2 className="mb-4 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
          Nueva plantilla
        </h2>
        <TemplateEditor
          action={nuevaPlantilla}
          varMap={varMap}
          sampleContactLabel={sampleLabel}
          statusError={
            params.error === "campos"
              ? "Completá nombre y cuerpo de la plantilla."
              : null
          }
        />
      </section>

      {/* Existentes */}
      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
          Existentes ({templates.length})
        </h2>
        {templates.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
            Sin plantillas guardadas.
          </p>
        ) : (
          <ul className="space-y-3">
            {templates.map((t) => (
              <li
                key={t.id}
                className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {t.nombre}
                  </span>
                  <span className="font-mono text-xs text-zinc-400">
                    {CHANNEL_ICON[t.channel]} {t.channel} · {t.estado}
                  </span>
                </div>
                {t.asunto && (
                  <div className="mt-1 text-sm text-zinc-500">
                    Asunto: {t.asunto}
                  </div>
                )}
                <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-300">
                  {t.cuerpo}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {templateVars(`${t.asunto ?? ""} ${t.cuerpo}`).map((v) => (
                    <span
                      key={v}
                      className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-500 dark:bg-zinc-800"
                    >
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
