import Link from "next/link";
import { notFound } from "next/navigation";
import { getEncuesta } from "@/lib/encuestas";
import { requireProject } from "@/lib/workspace";
import { FormStatus, SubmitButton } from "@/components/ui/submit-button";
import { QuestionEditor } from "@/components/encuestas/question-editor";
import { guardarPreguntas, publicarEncuesta, cerrarEncuesta } from "../actions";

export const metadata = { title: "Editar encuesta · Tronador" };

function publicUrl(slug: string): string {
  const base = process.env.NEXTAUTH_URL ?? "";
  return `${base}/e/${slug}`;
}

export default async function EncuestaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const { id: projectId } = await requireProject();
  const enc = await getEncuesta(projectId, id);
  if (!enc) notFound();

  const okMap: Record<string, string> = {
    guardada: "Cambios guardados.",
    publicada: "Encuesta publicada. Ya podés distribuir el link público.",
    cerrada: "Encuesta cerrada. No recibe más respuestas.",
  };
  const okMsg = sp.ok ? okMap[sp.ok] ?? null : null;
  const errMsg =
    sp.error === "validacion"
      ? sp.detalle ?? "Revisá las preguntas."
      : sp.error
        ? "No se pudo guardar."
        : null;

  const isPublished = enc.estado === "publicada";
  const isClosed = enc.estado === "cerrada";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <nav className="flex items-center justify-between">
        <Link href="/encuestas" className="text-sm text-zinc-500 underline-offset-4 hover:underline">
          ← Encuestas
        </Link>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {enc.estado}
        </span>
      </nav>

      <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        {enc.titulo}
      </h1>

      <FormStatus ok={okMsg} error={errMsg} />

      {isPublished && enc.slug && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs dark:border-emerald-900/40 dark:bg-emerald-950/30">
          <span className="font-medium text-emerald-800 dark:text-emerald-300">
            Link público:
          </span>{" "}
          <code className="break-all font-mono text-emerald-900 dark:text-emerald-200">
            {publicUrl(enc.slug)}
          </code>
        </div>
      )}

      <QuestionEditor
        encuestaId={enc.id}
        titulo={enc.titulo}
        descripcion={enc.descripcion ?? ""}
        initial={enc.preguntas}
        readOnly={isClosed}
        action={guardarPreguntas}
      />

      {!isClosed && (
        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          {!isPublished && (
            <form action={publicarEncuesta}>
              <input type="hidden" name="id" value={enc.id} />
              <SubmitButton pendingLabel="Publicando…">Publicar</SubmitButton>
            </form>
          )}
          <form action={cerrarEncuesta}>
            <input type="hidden" name="id" value={enc.id} />
            <SubmitButton pendingLabel="Cerrando…" variant="secondary">
              Cerrar encuesta
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
