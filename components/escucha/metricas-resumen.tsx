// Métricas de volumen arriba del tab Monitoreo: una tabla 24 h / 7 días con
// menciones, redes, medios digitales, me gusta y comentarios, más las palabras
// clave monitoreadas. Cifras en mono tabular; sin plantilla hero-metric.
// Server component puro.
import Link from "next/link";
import type { ResumenMenciones } from "@/lib/escucha-resumen";

const KEYWORDS_VISIBLES = 12;

const Celda = ({ n }: { n: number }) => (
  <td className="px-3 py-1.5 text-right font-mono text-[13px] tabular-nums text-zinc-800 dark:text-zinc-200">
    {n.toLocaleString("es-AR")}
  </td>
);

function Fila({ etiqueta, r }: { etiqueta: string; r: ResumenMenciones }) {
  return (
    <tr className="border-t border-zinc-200 dark:border-zinc-800">
      <th
        scope="row"
        className="px-3 py-1.5 text-left text-xs font-medium text-zinc-500"
      >
        {etiqueta}
      </th>
      <Celda n={r.total} />
      <Celda n={r.enRedes} />
      <Celda n={r.enMedios} />
      <Celda n={r.meGusta} />
      <Celda n={r.comentarios} />
    </tr>
  );
}

export function MetricasResumen({
  resumen24,
  resumen7,
  keywords,
}: {
  resumen24: ResumenMenciones;
  resumen7: ResumenMenciones;
  keywords: string[];
}) {
  const visibles = keywords.slice(0, KEYWORDS_VISIBLES);
  const resto = keywords.length - visibles.length;

  return (
    <section className="space-y-4 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Volumen</h2>
        <p className="text-[11px] text-zinc-500">
          me gusta y comentarios: solo de menciones que traen métricas
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
                Ventana
              </th>
              {["Menciones", "En redes", "En medios", "Me gusta", "Comentarios"].map((h) => (
                <th
                  key={h}
                  className="px-3 py-1.5 text-right text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Fila etiqueta="Últimas 24 h" r={resumen24} />
            <Fila etiqueta="Últimos 7 días" r={resumen7} />
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
          Palabras clave ({keywords.length})
        </span>
        {visibles.map((k) => (
          <span
            key={k}
            className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            {k}
          </span>
        ))}
        {resto > 0 && <span className="text-xs text-zinc-500">+{resto} más</span>}
        <Link
          href="/escucha?tab=entorno"
          className="ml-1 text-xs text-[oklch(52%_0.13_255)] underline-offset-2 hover:underline"
        >
          editar en Entorno →
        </Link>
      </div>
    </section>
  );
}
