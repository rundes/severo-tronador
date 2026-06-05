"use client";

import { useRef, useState } from "react";
import { QuestionField } from "@/components/encuestas/survey-form";
import { buildSteps, type Question } from "@/lib/encuestas/types";

// Diseño "paso a paso" con barra de progreso. Los pasos se arman según
// stepMode: "one" = una pregunta por paso; "manual" = agrupadas por step.
// Todas las preguntas se montan (ocultas) para que el submit final incluya
// todas las respuestas; validación de requeridas manual (un control oculto con
// `required` nativo rompe el submit del browser).
export function SurveyStepper({
  questions,
  stepMode,
  action,
  hidden,
}: {
  questions: Question[];
  stepMode: string;
  action: (formData: FormData) => void;
  hidden: Record<string, string>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const steps = buildSteps(questions, stepMode);
  const total = steps.length;
  const isLast = step >= total - 1;
  const pct = total ? Math.round(((step + 1) / total) * 100) : 0;

  function answered(q: Question): boolean {
    const form = formRef.current;
    if (!form) return true;
    const fd = new FormData(form);
    const vals = fd.getAll(`q_${q.id}`).map((v) => String(v).trim()).filter(Boolean);
    return vals.length > 0;
  }

  function stepValid(): boolean {
    return (steps[step] ?? []).every((q) => !q.required || answered(q));
  }

  function next() {
    if (!stepValid()) {
      setError("Respondé las preguntas obligatorias de este paso.");
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, total - 1));
  }
  function back() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }
  function onSubmit(e: React.FormEvent) {
    if (!stepValid()) {
      e.preventDefault();
      setError("Respondé las preguntas obligatorias de este paso.");
    }
  }

  return (
    <form ref={formRef} action={action} onSubmit={onSubmit} className="mt-6">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}

      {/* Progreso */}
      <div className="mb-5">
        <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
          <span>Paso {Math.min(step + 1, total)} de {total}</span>
          <span>{pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-[oklch(55%_0.12_240)] transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Pasos: todos montados, solo el actual visible. Sin required nativo. */}
      {steps.map((group, gi) => (
        <div key={gi} hidden={gi !== step} className="space-y-6">
          {group.map((q) => (
            <div key={q.id} className="space-y-2">
              <label className="block text-lg font-medium leading-snug text-zinc-900 dark:text-zinc-100">
                {q.label}
                {q.required && <span className="ml-0.5 text-red-500">*</span>}
              </label>
              {q.description && (
                <p className="text-sm leading-snug text-zinc-500">{q.description}</p>
              )}
              <div className="pt-1">
                <QuestionField q={{ ...q, required: false }} />
              </div>
            </div>
          ))}
        </div>
      ))}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex items-center gap-2">
        {step > 0 && (
          <button
            type="button"
            onClick={back}
            className="rounded-lg border border-zinc-300 px-4 py-3 text-base font-medium text-zinc-700 active:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:active:bg-zinc-800"
          >
            Atrás
          </button>
        )}
        {isLast ? (
          <button
            type="submit"
            className="flex-1 rounded-lg bg-zinc-900 px-4 py-3.5 text-base font-medium text-white active:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Enviar respuesta
          </button>
        ) : (
          <button
            type="button"
            onClick={next}
            className="flex-1 rounded-lg bg-zinc-900 px-4 py-3.5 text-base font-medium text-white active:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Siguiente
          </button>
        )}
      </div>
    </form>
  );
}
