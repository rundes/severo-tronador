// Render del formulario de respuesta de una encuesta (público o tokenizado).
// Server component: inputs nativos, sin JS. Cada campo se llama `q_<id>`.
// El texto (labels/opciones) se renderiza como texto plano (nunca HTML).
import { scaleBounds, type Question } from "@/lib/encuestas/types";

const fieldCls =
  "w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900";

function QuestionField({ q }: { q: Question }) {
  const name = `q_${q.id}`;
  if (q.type === "paragraph") {
    return <textarea name={name} rows={3} required={q.required} className={`${fieldCls} resize-y`} />;
  }
  if (q.type === "text") {
    return <input type="text" name={name} required={q.required} className={fieldCls} />;
  }
  if (q.type === "single") {
    return (
      <div className="space-y-1">
        {(q.options ?? []).map((opt) => (
          <label key={opt} className="flex items-center gap-2 text-sm">
            <input type="radio" name={name} value={opt} required={q.required} />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    );
  }
  if (q.type === "multi") {
    return (
      <div className="space-y-1">
        {(q.options ?? []).map((opt) => (
          <label key={opt} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={name} value={opt} />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    );
  }
  if (q.type === "boolean") {
    return (
      <div className="flex gap-4">
        {["Sí", "No"].map((opt) => (
          <label key={opt} className="flex items-center gap-2 text-sm">
            <input type="radio" name={name} value={opt} required={q.required} />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    );
  }
  // scale
  const { min, max } = scaleBounds(q);
  const ticks = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div className="flex flex-wrap gap-3">
      {ticks.map((n) => (
        <label key={n} className="flex flex-col items-center gap-1 text-xs">
          <input type="radio" name={name} value={n} required={q.required} />
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
    <form action={action} className="mt-5 space-y-4">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {questions.map((q) => (
        <div key={q.id} className="space-y-1.5">
          <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {q.label}
            {q.required && <span className="ml-0.5 text-red-500">*</span>}
          </label>
          <QuestionField q={q} />
        </div>
      ))}
      <button
        type="submit"
        className="w-full rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
      >
        Enviar respuesta
      </button>
    </form>
  );
}
