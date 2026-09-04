// Landing pública de la serie de informes de Ferro: tronador.net.ar/ferro.
// Sin sesión (está en PUBLIC_PATHS del middleware) y solo lectura. Publica
// EXCLUSIVAMENTE título, fecha y cuerpo de cada informe: la nota operativa y
// la URL de conversación son material interno del operador y no se renderizan.
//
// noindex a propósito: la página es abierta para quien tenga el link, pero no
// se ofrece a los buscadores. Sacarlo es una decisión editorial, no técnica.
import { readDailyReports, type DailyReport } from "@/lib/daily-report";
import { reportTitle } from "@/lib/report-markdown";
import { ReportView } from "@/components/escucha/report-view";

// Proyecto Ferro (fijo: esta landing es de un solo proyecto por diseño).
const FERRO_PROJECT_ID = "1b522762-7866-4cce-b3e4-2972bdec8160";

// La serie cambia a lo sumo un par de veces por día: cache de 5 minutos.
export const revalidate = 300;

export const metadata = {
  title: "Ferro · Serie de informes",
  description:
    "Serie de informes diarios de monitoreo de conversación pública sobre el Club Ferro Carril Oeste.",
  robots: { index: false, follow: false },
};

const tituloDe = (r: DailyReport): string =>
  r.titulo ?? reportTitle(r.markdown) ?? "(sin título)";

const fechaLarga = (iso: string): string =>
  new Date(iso).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const anchorDe = (iso: string): string => `informe-${iso.slice(0, 10)}-${iso.slice(11, 16).replace(":", "")}`;

export default async function FerroPublicPage() {
  const { latest, history } = await readDailyReports(FERRO_PROJECT_ID);
  const serie = [latest, ...history].filter((r): r is DailyReport => Boolean(r));

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="mb-10">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
          Monitoreo de conversación pública
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Ferro Carril Oeste
        </h1>
        <p className="mt-2 max-w-[60ch] text-sm text-zinc-500">
          Serie de informes diarios sobre lo que se dice del club y de su
          elección en redes y medios. El más reciente primero.
        </p>
      </header>

      {serie.length === 0 ? (
        <p className="text-sm text-zinc-500">Todavía no hay informes publicados.</p>
      ) : (
        <>
          <nav aria-label="Índice de informes" className="mb-10">
            <ol className="space-y-1.5">
              {serie.map((r) => (
                <li key={r.at} className="text-sm leading-snug">
                  <a
                    href={`#${anchorDe(r.at)}`}
                    className="text-zinc-700 underline-offset-2 hover:text-[oklch(52%_0.13_255)] hover:underline dark:text-zinc-300"
                  >
                    <span className="font-mono text-[12px] tabular-nums text-zinc-500">
                      {fechaLarga(r.at)}
                    </span>{" "}
                    · {tituloDe(r)}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="space-y-14">
            {serie.map((r, i) => (
              <article
                key={r.at}
                id={anchorDe(r.at)}
                className="scroll-mt-6 border-t border-zinc-200 pt-8 dark:border-zinc-800"
              >
                <p className="mb-4 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
                  {fechaLarga(r.at)}
                  {i === 0 && " · último informe"}
                </p>
                <ReportView markdown={r.markdown} />
              </article>
            ))}
          </div>
        </>
      )}

      <footer className="mt-16 border-t border-zinc-200 pt-4 text-[11px] text-zinc-500 dark:border-zinc-800">
        Elaborado con Tronador. Los informes se publican tal como se emitieron
        cada día; los anteriores al último pueden estar abreviados.
      </footer>
    </main>
  );
}
