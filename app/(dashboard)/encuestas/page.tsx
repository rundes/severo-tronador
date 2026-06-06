import Link from "next/link";
import { listEncuestas } from "@/lib/encuestas";
import { requireProject } from "@/lib/workspace";
import type { EncuestaEstado } from "@/lib/encuestas/types";
import { duplicarEncuesta } from "./actions";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Encuestas · Tronador" };

const ESTADO_TONE: Record<EncuestaEstado, "neutral" | "ok" | "warn"> = {
  borrador: "neutral",
  publicada: "ok",
  cerrada: "warn",
};

export default async function EncuestasPage() {
  const { id: projectId } = await requireProject();
  const encuestas = await listEncuestas(projectId);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        eyebrow="Investigación"
        title="Encuestas"
        subtitle="Creá encuestas, publicá un link público y enviálas por mail a un segmento."
        action={
          <Link href="/encuestas/nueva" className={buttonClass("accent")}>
            Nueva encuesta
          </Link>
        }
      />

      {encuestas.length === 0 ? (
        <p className="rounded border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Todavía no hay encuestas. Creá la primera.
        </p>
      ) : (
        <ol className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {encuestas.map((e) => (
            <li key={e.id} className="flex items-center transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900">
              <Link
                href={`/encuestas/${e.id}`}
                className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3"
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
                <span className="shrink-0">
                  <Badge tone={ESTADO_TONE[e.estado]} dot>
                    {e.estado}
                  </Badge>
                </span>
              </Link>
              <form action={duplicarEncuesta} className="shrink-0 pr-3">
                <input type="hidden" name="id" value={e.id} />
                <button
                  type="submit"
                  title="Duplicar encuesta"
                  className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  Duplicar
                </button>
              </form>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
