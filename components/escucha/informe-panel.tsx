// Tab Informe: último informe diario generado con Claude, generación
// on-demand (barrido + síntesis), historial y setup de la extensión.
import { generarInformeAhora } from "@/app/(dashboard)/escucha/actions";
import { SubmitButton, FormStatus } from "@/components/ui/submit-button";
import { ExtensionTokenButton } from "@/components/escucha/extension-token-button";
import type { DailyReport } from "@/lib/daily-report";
import type { MonitorConfig } from "@/lib/monitor-config";
import { MonitorEditor } from "@/components/escucha/monitor-editor";

function fecha(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function InformePanel({
  latest,
  history,
  generado,
  monitor,
  monitorSaved,
}: {
  latest: DailyReport | null;
  history: DailyReport[];
  generado: boolean;
  monitor: MonitorConfig;
  monitorSaved: boolean;
}) {
  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50/60 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="text-sm text-zinc-700 dark:text-zinc-200">
          {latest ? (
            <>
              Último informe:{" "}
              <span className="font-mono tabular-nums">{fecha(latest.at)}</span>
              {" · "}
              <span className="font-mono tabular-nums">{latest.items24h}</span>{" "}
              menciones 24h
            </>
          ) : (
            "Todavía no hay informes. El cron corre todos los días a las 09:00; también podés generar uno ahora."
          )}
        </div>
        <form action={generarInformeAhora}>
          <SubmitButton variant="accent" pendingLabel="Barriendo fuentes y generando…">
            Barrer y generar informe
          </SubmitButton>
        </form>
      </section>
      <FormStatus
        ok={generado ? "Informe generado y enviado a los owners por mail." : null}
        error={null}
      />

      {latest && (
        <article className="rounded-lg border border-zinc-200 p-5 shadow-[var(--shadow-rest)] dark:border-zinc-800">
          <div className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-zinc-800 dark:text-zinc-200">
            {latest.markdown}
          </div>
        </article>
      )}

      {history.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Informes anteriores
          </h2>
          <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {history.map((r) => (
              <li key={r.at} className="px-3 py-2">
                <details>
                  <summary className="cursor-pointer text-xs text-zinc-600 dark:text-zinc-300">
                    <span className="font-mono tabular-nums">{fecha(r.at)}</span>
                    {" · "}
                    {r.items24h} menciones
                  </summary>
                  <div className="mt-2 whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                    {r.markdown}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}

      <MonitorEditor cfg={monitor} saved={monitorSaved} />

      <section className="space-y-2 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Extensión de Chrome
        </h2>
        <p className="max-w-[70ch] text-xs text-zinc-500">
          La extensión corre en tu navegador (tu sesión, tu IP): muestra el
          escenario y las keywords del proyecto, abre búsquedas complementarias
          en Google News, X, Facebook, Instagram y TikTok, y captura lo que ves
          para sumarlo al historial que alimenta este informe.
        </p>
        <ol className="max-w-[70ch] list-decimal space-y-1 pl-5 text-xs text-zinc-500">
          <li>
            Descargá el .zip y descomprimilo (&quot;Extraer todo&quot;) en una
            carpeta que no vayas a borrar: Chrome la lee desde ahí. Adentro
            tiene que quedar <code>manifest.json</code> directamente.
          </li>
          <li>
            <code>chrome://extensions</code> → activá &quot;Modo de
            desarrollador&quot; → &quot;Cargar descomprimida&quot; → elegí la
            carpeta.
          </li>
          <li>
            Generá el token (solo owner), y en Opciones de la extensión pegá la
            URL de esta app + el token.
          </li>
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/api/extension/download"
            download
            className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Descargar extensión (.zip)
          </a>
          <ExtensionTokenButton />
        </div>
      </section>
    </div>
  );
}
