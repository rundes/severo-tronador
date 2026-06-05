import Link from "next/link";
import { listEncuestas } from "@/lib/encuestas";
import { requireProject } from "@/lib/workspace";
import type { EncuestaEstado } from "@/lib/encuestas/types";

export const metadata = { title: "Encuestas · Tronador" };

const ESTADO_BADGE: Record<EncuestaEstado, string> = {
  borrador: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  publicada: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  cerrada: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
};

export default async function EncuestasPage() {
  const { id: projectId } = await requireProject();
  const encuestas = await listEncuestas(projectId);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Encuestas
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Creá encuestas, publicá un link público y enviálas por mail a un segmento.
          </p>
        </div>
        <Link
          href="/encuestas/nueva"
          className="rounded bg-[oklch(35%_0.04_240)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          Nueva encuesta
        </Link>
      </header>

      {encuestas.length === 0 ? (
        <p className="rounded border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Todavía no hay encuestas. Creá la primera.
        </p>
      ) : (
        <ol className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {encuestas.map((e) => (
            <li key={e.id}>
              <Link
                href={`/encuestas/${e.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {e.titulo}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {e.preguntas.length} pregunta{e.preguntas.length === 1 ? "" : "s"} ·{" "}
                    {new Date(e.createdAt).toLocaleDateString("es-AR")}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTADO_BADGE[e.estado]}`}
                >
                  {e.estado}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
