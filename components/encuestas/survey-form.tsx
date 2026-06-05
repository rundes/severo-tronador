// Render del formulario de encuesta (minimal) + widgets de campo compartidos
// con el stepper. Tema claro (superficie pública, respondida al aire libre en
// celular): papel cálido, tinta azulada, un acento índigo para selección/acción.
// Mobile-first, escala a desktop con la tarjeta centrada del Shell.
import { scaleBounds, type Question } from "@/lib/encuestas/types";

// Paleta (oklch). Acento índigo confiable; selección = borde+tinte; tinta cálida.
const INPUT =
  "w-full rounded-xl border border-[oklch(90%_0.01_95)] bg-[oklch(99.5%_0.004_95)] px-3.5 py-3 text-base text-[oklch(28%_0.02_265)] placeholder:text-[oklch(70%_0.02_265)] outline-none transition focus-visible:border-[oklch(52%_0.13_255)] focus-visible:ring-4 focus-visible:ring-[oklch(52%_0.13_255)]/15";

// Tarjeta de opción tappable. Selected → borde acento + tinte + check.
const OPTION =
  "group relative flex cursor-pointer items-center gap-3 rounded-xl border border-[oklch(90%_0.01_95)] bg-[oklch(99.5%_0.004_95)] px-4 py-3.5 text-base text-[oklch(30%_0.02_265)] transition active:scale-[0.99] has-[:checked]:border-[oklch(52%_0.13_255)] has-[:checked]:bg-[oklch(96.5%_0.025_255)] has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[oklch(52%_0.13_255)]/15";

function Dot({ square }: { square?: boolean }) {
  // Indicador custom (el input nativo va sr-only). Marca con check al elegir.
  return (
    <span
      className={`grid h-5 w-5 shrink-0 place-items-center border-2 border-[oklch(80%_0.02_265)] text-white transition group-has-[:checked]:border-[oklch(52%_0.13_255)] group-has-[:checked]:bg-[oklch(52%_0.13_255)] ${
        square ? "rounded-md" : "rounded-full"
      }`}
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3 opacity-0 transition group-has-[:checked]:opacity-100" fill="none" aria-hidden>
        <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

// `nativeRequired` controla el atributo HTML `required`. El stepper monta TODAS
// las preguntas a la vez (ocultas) y valida manualmente: un `required` nativo en
// un control oculto rompe el submit (el navegador no puede enfocar un campo
// invisible) → el stepper pasa `false`. El form de página única lo deja en true.
export function QuestionField({
  q,
  nativeRequired = true,
}: {
  q: Question;
  nativeRequired?: boolean;
}) {
  const name = `q_${q.id}`;
  const req = nativeRequired && q.required;

  if (q.type === "paragraph") {
    return <textarea name={name} rows={4} required={req} className={`${INPUT} resize-y leading-relaxed`} />;
  }
  if (q.type === "text") {
    return <input type="text" name={name} required={req} className={INPUT} />;
  }
  if (q.type === "single") {
    return (
      <div className="grid gap-2.5">
        {(q.options ?? []).map((opt) => (
          <label key={opt} className={OPTION}>
            <input type="radio" name={name} value={opt} required={req} className="peer sr-only" />
            <Dot />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    );
  }
  if (q.type === "multi") {
    return (
      <div className="grid gap-2.5">
        {(q.options ?? []).map((opt) => (
          <label key={opt} className={OPTION}>
            <input type="checkbox" name={name} value={opt} className="peer sr-only" />
            <Dot square />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    );
  }
  if (q.type === "boolean") {
    return (
      <div className="grid grid-cols-2 gap-2.5">
        {["Sí", "No"].map((opt) => (
          <label
            key={opt}
            className="flex cursor-pointer items-center justify-center rounded-xl border border-[oklch(90%_0.01_95)] bg-[oklch(99.5%_0.004_95)] px-4 py-3.5 text-base font-medium text-[oklch(30%_0.02_265)] transition active:scale-[0.99] has-[:checked]:border-[oklch(52%_0.13_255)] has-[:checked]:bg-[oklch(52%_0.13_255)] has-[:checked]:text-white"
          >
            <input type="radio" name={name} value={opt} required={req} className="sr-only" />
            {opt}
          </label>
        ))}
      </div>
    );
  }
  // scale → control segmentado; selección con relleno acento.
  const { min, max } = scaleBounds(q);
  const ticks = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div>
      <div className="flex gap-1.5">
        {ticks.map((n) => (
          <label
            key={n}
            className="flex h-12 flex-1 cursor-pointer select-none items-center justify-center rounded-lg border border-[oklch(90%_0.01_95)] bg-[oklch(99.5%_0.004_95)] text-base font-semibold text-[oklch(35%_0.02_265)] transition active:scale-[0.97] has-[:checked]:border-[oklch(52%_0.13_255)] has-[:checked]:bg-[oklch(52%_0.13_255)] has-[:checked]:text-white"
          >
            <input type="radio" name={name} value={n} required={req} className="sr-only" />
            {n}
          </label>
        ))}
      </div>
      <div className="mt-1 flex justify-between px-1 text-xs text-[oklch(60%_0.02_265)]">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export function FieldBlock({
  q,
  index,
  nativeRequired = true,
}: {
  q: Question;
  index?: number;
  nativeRequired?: boolean;
}) {
  return (
    <div className="space-y-2.5">
      <label className="block text-[1.0625rem] font-semibold leading-snug text-[oklch(26%_0.02_265)]">
        {typeof index === "number" && (
          <span className="mr-1.5 text-[oklch(70%_0.03_255)]">{index + 1}.</span>
        )}
        {q.label}
        {q.required && <span className="ml-0.5 text-[oklch(55%_0.18_25)]">*</span>}
      </label>
      {q.description && (
        <p className="text-sm leading-snug text-[oklch(52%_0.02_265)]">{q.description}</p>
      )}
      <QuestionField q={q} nativeRequired={nativeRequired} />
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
    <form action={action} className="space-y-7">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {questions.map((q, i) => (
        <FieldBlock key={q.id} q={q} index={i} />
      ))}
      <button
        type="submit"
        className="sticky bottom-3 w-full rounded-xl bg-[oklch(52%_0.13_255)] px-4 py-3.5 text-base font-semibold text-white shadow-md transition hover:bg-[oklch(47%_0.13_255)] active:scale-[0.99]"
      >
        Enviar respuesta
      </button>
    </form>
  );
}
