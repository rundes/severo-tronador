// Render del formulario de respuesta de una encuesta (público o tokenizado).
// Mobile-first: inputs grandes (text-base evita zoom iOS), opciones como
// tarjetas tappables (>=44px), submit full-width. Server component: inputs
// nativos, sin JS. Cada campo se llama `q_<id>`. Texto como texto plano.
import { scaleBounds, type Question } from "@/lib/encuestas/types";

const textCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-3 text-base focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900";

// Tarjeta tappable para radio/checkbox: resalta cuando el control está marcado.
const cardCls =
  "flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-300 p-3.5 text-base transition-colors has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-50 active:bg-zinc-100 dark:border-zinc-700 dark:has-[:checked]:border-zinc-100 dark:has-[:checked]:bg-zinc-800/60 dark:active:bg-zinc-800";
const controlCls = "h-5 w-5 shrink-0 accent-zinc-900 dark:accent-zinc-100";

export function QuestionField({ q }: { q: Question }) {
  const name = `q_${q.id}`;
  if (q.type === "paragraph") {
    return <textarea name={name} rows={4} required={q.required} className={`${textCls} resize-y`} />;
  }
  if (q.type === "text") {
    return <input type="text" name={name} required={q.required} className={textCls} />;
  }
  if (q.type === "single") {
    return (
      <div className="space-y-2">
        {(q.options ?? []).map((opt) => (
          <label key={opt} className={cardCls}>
            <input type="radio" name={name} value={opt} required={q.required} className={controlCls} />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    );
  }
  if (q.type === "multi") {
    return (
      <div className="space-y-2">
        {(q.options ?? []).map((opt) => (
          <label key={opt} className={cardCls}>
            <input type="checkbox" name={name} value={opt} className={controlCls} />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    );
  }
  if (q.type === "boolean") {
    return (
      <div className="grid grid-cols-2 gap-2">
        {["Sí", "No"].map((opt) => (
          <label key={opt} className={`${cardCls} justify-center font-medium`}>
            <input type="radio" name={name} value={opt} required={q.required} className="sr-only" />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    );
  }
  // scale: fila de objetivos tappables grandes, scrollable si no entra.
  const { min, max } = scaleBounds(q);
  const ticks = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {ticks.map((n) => (
        <label
          key={n}
          className="flex h-12 min-w-12 flex-1 cursor-pointer items-center justify-center rounded-lg border border-zinc-300 text-base font-medium transition-colors has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-900 has-[:checked]:text-white active:bg-zinc-100 dark:border-zinc-700 dark:has-[:checked]:border-zinc-100 dark:has-[:checked]:bg-zinc-100 dark:has-[:checked]:text-zinc-900"
        >
          <input type="radio" name={name} value={n} required={q.required} className="sr-only" />
          <span>{n}</span>
        </label>
      ))}
    </div>
  );
}

export function SurveyForm({
  questions,
  action,
  hidden,
}: {
  questions: Question[];
  action: (formData: FormData) => void;
  hidden: Record<string, string>;
}) {
  return (
    <form action={action} className="mt-6 space-y-6">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {questions.map((q, i) => (
        <div key={q.id} className="space-y-2">
          <label className="block text-base font-medium leading-snug text-zinc-900 dark:text-zinc-100">
            <span className="mr-1 text-zinc-400">{i + 1}.</span>
            {q.label}
            {q.required && <span className="ml-0.5 text-red-500">*</span>}
          </label>
          {q.description && (
            <p className="text-sm leading-snug text-zinc-500">{q.description}</p>
          )}
          <QuestionField q={q} />
        </div>
      ))}
      <button
        type="submit"
        className="w-full rounded-lg bg-zinc-900 px-4 py-3.5 text-base font-medium text-white transition-colors hover:bg-zinc-700 active:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        Enviar respuesta
      </button>
    </form>
  );
}
