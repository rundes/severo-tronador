import Link from "next/link";
import { nuevaPlantilla, enviarPruebaTemplate, generarHtmlConIA } from "./actions";
import { listTemplates, getTemplate, templateVars } from "@/lib/templates";
import { SUPPORTED_VARS, buildVarMap } from "@/lib/interpolate-vars";
import { loadContacts } from "@/lib/segments";
import { requireProject } from "@/lib/workspace";
import { auth } from "@/lib/auth";
import { TemplateEditor } from "@/components/templates/template-editor";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
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
  const { id: projectId } = await requireProject();
  const templates = await listTemplates();
  const session = await auth();
  const userEmail = session?.user?.email ?? undefined;

  // Edición: ?edit=<id> precarga la plantilla en el editor de arriba.
  const editId = params.edit?.trim();
  const editing = editId ? await getTemplate(editId) : undefined;
  const okMsg =
    params.ok === "actualizada"
      ? "Plantilla actualizada."
      : params.ok === "creada"
        ? "Plantilla creada."
        : null;
  const errMsg =
    params.error === "campos"
      ? "Completá nombre y cuerpo de la plantilla."
      : params.error === "no_existe"
        ? "Esa plantilla ya no existe."
        : null;

  // Sample contact para el preview. Tomamos el primero del padrón para
  // mantener el render puro (sin Math.random/Date.now de regla react/purity).
  let sample: Contact = DEMO_CONTACT;
  try {
    const all = await loadContacts(projectId);
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
    <div className="mx-auto max-w-7xl space-y-8">
      <PageHeader
        eyebrow="Contenido"
        title="Plantillas"
        subtitle="Mensajes por canal con variables. Editor con preview lado a lado, autocomplete y validación."
      />

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

      {/* Nueva plantilla / edición — editor rich */}
      <section
        id="editor"
        className="scroll-mt-6 rounded-lg border border-dashed border-zinc-300 p-5 dark:border-zinc-700"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            {editing ? `Editar plantilla · ${editing.nombre}` : "Nueva plantilla"}
          </h2>
          {editing && (
            <Link
              href="/templates#editor"
              className="text-xs text-zinc-500 underline-offset-4 hover:underline"
            >
              Cancelar edición
            </Link>
          )}
        </div>
        <TemplateEditor
          key={editing?.id ?? "nueva"}
          action={nuevaPlantilla}
          testAction={enviarPruebaTemplate}
          aiAction={generarHtmlConIA}
          varMap={varMap}
          sampleContactLabel={sampleLabel}
          defaultTestEmail={userEmail}
          modelos={templates
            .filter((t) => t.channel === "email" && t.formato === "html" && t.cuerpoHtml)
            .map((t) => ({ id: t.id, nombre: t.nombre, html: t.cuerpoHtml as string }))}
          initial={
            editing
              ? {
                  id: editing.id,
                  channel: editing.channel,
                  nombre: editing.nombre,
                  asunto: editing.asunto,
                  formato: editing.formato,
                  cuerpo: editing.cuerpo,
                  cuerpoHtml: editing.cuerpoHtml ?? undefined,
                }
              : undefined
          }
          statusOk={okMsg}
          statusError={errMsg}
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
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {t.nombre}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs text-zinc-400">
                      {CHANNEL_ICON[t.channel]} {t.channel}
                      {t.formato === "html" ? " · HTML" : t.formato === "html_full" ? " · HTML full" : ""}
                    </span>
                    <Badge tone={t.estado === "activo" ? "ok" : "neutral"} dot>
                      {t.estado}
                    </Badge>
                    <Link
                      href={`/templates?edit=${t.id}#editor`}
                      className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Editar
                    </Link>
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
