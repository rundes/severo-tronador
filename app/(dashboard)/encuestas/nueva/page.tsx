import Link from "next/link";
import { FormStatus, SubmitButton } from "@/components/ui/submit-button";
import { SURVEY_LAYOUTS, DEFAULT_LAYOUT } from "@/lib/encuestas/layouts";
import { crearEncuesta } from "../actions";

export const metadata = { title: "Nueva encuesta · Tronador" };

const inputCls =
  "w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900";

export default async function NuevaEncuestaPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const errMsg = sp.error === "titulo" ? "El título es obligatorio." : null;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <nav>
        <Link
          href="/encuestas"
          className="text-sm text-zinc-500 underline-offset-4 hover:underline"
        >
          ← Volver a encuestas
        </Link>
      </nav>
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Nueva encuesta
      </h1>
      <form action={crearEncuesta} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            Título
          </span>
          <input type="text" name="titulo" required className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            Descripción <span className="font-normal normal-case text-zinc-400">(opcional)</span>
          </span>
          <textarea name="descripcion" rows={3} className={`${inputCls} resize-y`} />
        </label>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            Diseño
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {SURVEY_LAYOUTS.map((l) => (
              <label
                key={l.id}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-300 p-3 text-sm has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-50 dark:border-zinc-700 dark:has-[:checked]:border-zinc-100 dark:has-[:checked]:bg-zinc-800/60"
              >
                <input
                  type="radio"
                  name="layout"
                  value={l.id}
                  defaultChecked={l.id === DEFAULT_LAYOUT}
                  className="mt-0.5"
                />
                <span>
                  <span className="block font-medium text-zinc-800 dark:text-zinc-200">{l.label}</span>
                  <span className="block text-xs text-zinc-500">{l.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex items-center gap-3">
          <SubmitButton pendingLabel="Creando…">Crear y editar preguntas</SubmitButton>
          <Link href="/encuestas" className="text-sm text-zinc-500 hover:underline">
            Cancelar
          </Link>
        </div>
        <FormStatus ok={null} error={errMsg} />
      </form>
    </div>
  );
}
