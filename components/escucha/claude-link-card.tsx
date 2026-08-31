// Tarjeta "Claude" del tab Informe: URL del conector MCP, conversación
// vinculada, estado del canal e importación de un informe escrito afuera.
//
// Server component: los pedazos interactivos viven en archivos "use client"
// propios (McpUrlButton) o son forms con server actions.
import { vincularConversacion, importarInforme } from "@/app/(dashboard)/escucha/actions";
import { SubmitButton, FormStatus } from "@/components/ui/submit-button";
import { McpAccountUrlButton, McpUrlButton } from "@/components/escucha/mcp-url-button";
import { TOOL_NAMES } from "@/lib/mcp/tools";
import type { ClaudeLink } from "@/lib/claude-link";

function haceCuanto(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "recién";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} días`;
}

const fechaCorta = (iso: string): string =>
  new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });

export function ClaudeLinkCard({
  link,
  params,
}: {
  link: ClaudeLink;
  params: Record<string, string | undefined>;
}) {
  const estado = [
    link.lastToolAt ? `Última llamada: ${haceCuanto(link.lastToolAt)}` : "Todavía no llamó ninguna tool",
    link.client ? link.client : null,
    link.lastReportAt ? `último informe importado: ${fechaCorta(link.lastReportAt)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="space-y-4 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <div>
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Claude</h2>
        <p className="mt-1 max-w-[70ch] text-xs text-zinc-500">
          Tronador expone este proyecto como servidor MCP: Claude lee el brief,
          las métricas medidas, las menciones y los informes anteriores, propone
          actualizaciones del brief y guarda el informe que escriban juntos —con
          mail y PDF a los owners— sin que tengas que re-explicarle el cliente
          en cada sesión.
        </p>
      </div>

      <FormStatus
        ok={
          params.claude === "1"
            ? "Conversación guardada."
            : params.importado === "1"
              ? "Informe importado: quedó en el historial y salió el mail con el PDF."
              : null
        }
        error={
          params.claude_error === "url"
            ? "La URL tiene que ser de claude.ai (https://claude.ai/…)."
            : params.informe_error === "vacio"
              ? "Subí un archivo o pegá el texto del informe."
              : params.informe_error === "grande"
                ? "El informe supera los 400.000 caracteres."
                : params.informe_error === "tipo"
                  ? "Ese archivo no es un informe: subí .md, .html o .txt."
                  : params.informe_error === "invalido"
                    ? "No encontré ninguna sección reconocible en el informe."
                    : params.informe_error
                      ? "No se pudo importar el informe."
                      : null
        }
        detalle={null}
      />

      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">Conector</h3>
        <ol className="max-w-[70ch] list-decimal space-y-1 pl-5 text-xs text-zinc-500">
          <li>Generá la URL (solo owner) y copiala: se muestra una sola vez.</li>
          <li>
            En claude.ai: Configuración › Conectores › Agregar conector
            personalizado › pegá la URL › <strong>sin autenticación</strong>.
          </li>
          <li>
            En Claude Code: <code>claude mcp add --transport http tronador &lt;url&gt;</code>
          </li>
        </ol>
        <McpUrlButton />
        <p className="max-w-[70ch] text-[11px] text-zinc-500">
          Tools disponibles: {TOOL_NAMES.join(", ")}. Ninguna ejecuta barridos
          (eso sigue en la extensión y los crons); <code>update_scenario</code>{" "}
          edita el escenario de forma aditiva —keywords, cuentas, medios,
          calendario— sin poder reemplazar listas enteras.
        </p>
        <div className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
            Conector multiproyecto
          </h3>
          <p className="max-w-[70ch] text-xs text-zinc-500">
            Un solo conector para todos tus proyectos: suma la tool{" "}
            <code>list_projects</code> y el parámetro <code>project</code> en
            cada tool (opcional para leer —sin él lee este proyecto—,
            obligatorio para escribir: <code>save_report</code>,{" "}
            <code>link_conversation</code>, <code>propose_brief_updates</code> y{" "}
            <code>update_scenario</code> nunca caen a un default). Lectura con
            ser miembro; escritura exige editor u owner en el proyecto destino.
          </p>
          <McpAccountUrlButton />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">Conversación vinculada</h3>
        <form action={vincularConversacion} className="flex flex-wrap items-center gap-2">
          <label htmlFor="conversationUrl" className="sr-only">
            URL de la conversación de claude.ai
          </label>
          <input
            id="conversationUrl"
            name="conversationUrl"
            type="url"
            defaultValue={link.conversationUrl ?? ""}
            placeholder="https://claude.ai/chat/…"
            className="min-w-[280px] flex-1 rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <SubmitButton variant="secondary" pendingLabel="Guardando…">
            Guardar
          </SubmitButton>
          {link.conversationUrl && (
            <a
              href={link.conversationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[oklch(52%_0.13_255)] underline-offset-2 hover:underline"
            >
              Abrir en claude.ai →
            </a>
          )}
        </form>
        <p className="text-[11px] text-zinc-500">{estado}</p>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">Importar informe</h3>
        <form action={importarInforme} className="space-y-2">
          <input
            type="file"
            name="archivo"
            accept=".md,.markdown,.html,.htm,text/markdown,text/html"
            className="block text-xs text-zinc-600 file:mr-3 file:rounded file:border file:border-zinc-300 file:bg-transparent file:px-2 file:py-1 file:text-xs dark:text-zinc-300 dark:file:border-zinc-700"
          />
          <label htmlFor="texto" className="sr-only">
            Pegar el informe
          </label>
          <textarea
            id="texto"
            name="texto"
            rows={4}
            placeholder="…o pegá acá el Markdown o el HTML del informe"
            className="w-full rounded border border-zinc-300 px-2 py-1.5 font-mono text-[12px] dark:border-zinc-700 dark:bg-zinc-900"
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
              <input type="checkbox" name="enviarMail" defaultChecked className="accent-[oklch(52%_0.13_255)]" />
              Enviar por mail a los owners (con PDF)
            </label>
            <SubmitButton variant="secondary" pendingLabel="Importando…">
              Importar informe
            </SubmitButton>
          </div>
        </form>
      </div>
    </section>
  );
}
