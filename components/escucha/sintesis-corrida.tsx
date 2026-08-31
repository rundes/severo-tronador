// Síntesis de lo encontrado desde la última corrida, arriba del tab Informe.
// Tres renglones fijos (corrida, menciones, informe): el operador lee el estado
// en cinco segundos sin entrar a ningún detalle. Server component puro.
import Link from "next/link";
import type { ExtensionRun } from "@/lib/extension-run";
import { haceCuanto, type ResumenMenciones } from "@/lib/escucha-resumen";

function Renglon({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <dt className="w-36 shrink-0 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
        {etiqueta}
      </dt>
      <dd className="text-sm text-zinc-800 dark:text-zinc-200">{children}</dd>
    </div>
  );
}

const Cifra = ({ n }: { n: number }) => (
  <span className="font-mono text-[13px] tabular-nums">{n}</span>
);

export function SintesisCorrida({
  run,
  resumen24,
  ultimoInforme,
}: {
  run: ExtensionRun | null;
  resumen24: ResumenMenciones;
  ultimoInforme: { at: string; titulo: string } | null;
}) {
  const plataformas = resumen24.porPlataforma
    .slice(0, 4)
    .map((p) => `${p.plataforma} ${p.n}`)
    .join(" · ");
  const errores = run?.errores.length ?? 0;

  return (
    <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        Desde la última corrida
      </h2>
      <dl className="mt-3 space-y-2">
        <Renglon etiqueta="Corrida">
          {run ? (
            <>
              {haceCuanto(run.at) ?? "s/d"} · <Cifra n={run.cuentas} /> cuentas ·{" "}
              <Cifra n={run.items} /> items · <Cifra n={run.candidatos} /> candidatos
              {errores > 0 ? (
                <span className="text-amber-600 dark:text-amber-400">
                  {" "}· {errores} {errores === 1 ? "error" : "errores"}
                </span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400"> · sin errores</span>
              )}
            </>
          ) : (
            "la extensión todavía no corrió en este proyecto"
          )}
        </Renglon>
        <Renglon etiqueta="Menciones 24 h">
          {resumen24.total === 0 ? (
            "sin menciones nuevas"
          ) : (
            <>
              <Cifra n={resumen24.total} /> en total · <Cifra n={resumen24.enRedes} /> en redes ·{" "}
              <Cifra n={resumen24.enMedios} /> en medios
              {plataformas && <span className="text-zinc-500"> ({plataformas})</span>}
              {" · "}
              <Link
                href="/escucha?tab=monitoreo"
                className="text-[oklch(52%_0.13_255)] underline-offset-2 hover:underline"
              >
                ver en Monitoreo →
              </Link>
            </>
          )}
        </Renglon>
        <Renglon etiqueta="Último informe">
          {ultimoInforme ? (
            <>
              «{ultimoInforme.titulo}» · {haceCuanto(ultimoInforme.at) ?? ultimoInforme.at.slice(0, 10)}
            </>
          ) : (
            "todavía no hay informes"
          )}
        </Renglon>
      </dl>
    </section>
  );
}
