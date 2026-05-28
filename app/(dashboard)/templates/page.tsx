import { nuevaPlantilla } from "./actions";
import { listTemplates, templateVars } from "@/lib/templates";

export const metadata = { title: "Plantillas · Severo Tronador" };

const inputCls =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

const CHANNEL_ICON: Record<string, string> = {
  email: "📧",
  whatsapp: "💬",
  sms: "📱",
  voice: "☎️",
};

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const templates = await listTemplates();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Plantillas
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Mensajes por canal con variables <code>{"{{nombre}}"}</code>,{" "}
          <code>{"{{barrio}}"}</code>. Se interpolan por destinatario al enviar.
        </p>
      </div>

      <div className="space-y-3">
        {templates.map((t) => (
          <div
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
          </div>
        ))}
      </div>

      {params.error === "campos" && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30">
          Completá nombre y cuerpo de la plantilla.
        </div>
      )}

      <form
        action={nuevaPlantilla}
        className="space-y-3 rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700"
      >
        <div className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          Nueva plantilla
        </div>
        <select name="channel" defaultValue="email" className={`w-full ${inputCls}`}>
          <option value="email">📧 Email</option>
          <option value="whatsapp">💬 WhatsApp</option>
          <option value="sms">📱 SMS</option>
          <option value="voice">☎️ Voz (guion IVR)</option>
        </select>
        <input name="nombre" required placeholder="Nombre interno" className={`w-full ${inputCls}`} />
        <input
          name="asunto"
          placeholder="Asunto (solo email; admite variables)"
          className={`w-full ${inputCls}`}
        />
        <textarea
          name="cuerpo"
          required
          rows={4}
          placeholder="Cuerpo del mensaje. Usá {{nombre}}, {{barrio}}…"
          className={`w-full ${inputCls}`}
        />
        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Guardar plantilla
        </button>
      </form>
    </div>
  );
}
