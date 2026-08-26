// Tab Informe: último informe diario generado con Claude, generación
// on-demand (barrido + síntesis), historial y setup de la extensión. El
// brief, los actores sugeridos y el escenario viven en la pestaña Escenario.
import Link from "next/link";
import { generarInformeAhora } from "@/app/(dashboard)/escucha/actions";
import { SubmitButton, FormStatus } from "@/components/ui/submit-button";
import { ExtensionTokenButton } from "@/components/escucha/extension-token-button";
import { ReportView } from "@/components/escucha/report-view";
import type { DailyReport } from "@/lib/daily-report";

function fecha(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Lo que el modelo observó sobre la herramienta, la config o la calidad del
// dato. Es para el operador: va arriba del informe, no adentro (el informe no
// habla de sí mismo) y tampoco viaja en el PDF.
function NotaOperativa({ texto }: { texto: string }) {
  return (
    <aside
      data-block="nota-operativa"
      className="rounded-lg border border-amber-300 border-l-[3px] border-l-amber-600 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:border-l-amber-500 dark:bg-amber-950/30"
    >
      <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">
        Nota operativa
      </div>
      <p className="max-w-[80ch] text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">{texto}</p>
    </aside>
  );
}

export function InformePanel({
  latest,
  history,
  generado,
}: {
  latest: DailyReport | null;
  history: DailyReport[];
  generado: boolean;
}) {
  return (
    <div className="space-y-6">
      <p className="text-xs text-zinc-500">
        El brief, los actores sugeridos y el escenario se editan en la pestaña{" "}
        <Link
          href="/escucha?tab=escenario"
          className="font-medium text-[oklch(52%_0.13_255)] underline-offset-2 hover:underline"
        >
          Escenario →
        </Link>
      </p>
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

      {latest?.notaOperativa && <NotaOperativa texto={latest.notaOperativa} />}

      {latest && (
        <article className="rounded-lg border border-zinc-200 p-5 shadow-[var(--shadow-rest)] dark:border-zinc-800">
          <div className="mb-3 flex justify-end">
            <a
              href={`/escucha/informe-diario?at=${encodeURIComponent(latest.at)}`}
              aria-label={`Descargar PDF del informe del ${fecha(latest.at)}`}
              className="rounded border border-zinc-300 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Descargar PDF
            </a>
          </div>
          <ReportView markdown={latest.markdown} />
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
                  <div className="mt-2 flex justify-end">
                    <a
                      href={`/escucha/informe-diario?at=${encodeURIComponent(r.at)}`}
                      aria-label={`Descargar PDF del informe del ${fecha(r.at)}`}
                      className="rounded border border-zinc-300 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Descargar PDF
                    </a>
                  </div>
                  <div className="mt-2">
                    <ReportView markdown={r.markdown} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}

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
