"use client";

import { useRef, useState } from "react";
import { FieldBlock } from "@/components/encuestas/survey-form";
import { buildSteps, type Question } from "@/lib/encuestas/types";

// Stepper con progreso y navegación sticky (alcanzable con el pulgar en mobile).
// Pasos según stepMode ("one" = 1 por paso; "manual" = agrupadas por step).
// Todas las preguntas montadas (ocultas) → el submit final lleva todo; las
// requeridas se validan manualmente (un control oculto con required nativo
// rompería el submit).
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
    const vals = new FormData(form)
      .getAll(`q_${q.id}`)
      .map((v) => String(v).trim())
      .filter(Boolean);
    return vals.length > 0;
  }
  const stepValid = () => (steps[step] ?? []).every((q) => !q.required || answered(q));

  // Al cambiar de paso, volver al inicio de la página para empezar la nueva
  // tanda desde arriba con el título a la vista (si no, en mobile el usuario
  // queda abajo, sobre la navegación, sin ver las nuevas preguntas). rAF para
  // correr tras el render; fallback a la posición del form si no hay window.
  function scrollToTop() {
    requestAnimationFrame(() => {
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        formRef.current?.scrollIntoView({ block: "start" });
      }
    });
  }

  function next() {
    if (!stepValid()) return setError("Respondé las preguntas obligatorias.");
    setError(null);
    setStep((s) => Math.min(s + 1, total - 1));
    scrollToTop();
  }
  function back() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
    scrollToTop();
  }
  function onSubmit(e: React.FormEvent) {
    // Submit implícito (Enter en un campo) en un paso intermedio: NO finalizar
    // la encuesta — tratarlo como "Siguiente". Solo el último paso envía.
    if (!isLast) {
      e.preventDefault();
      next();
      return;
    }
    if (!stepValid()) {
      e.preventDefault();
      setError("Respondé las preguntas obligatorias.");
    }
  }

  return (
    <form ref={formRef} action={action} onSubmit={onSubmit}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}

      {/* Progreso */}
      <div className="mb-6">
        <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-[oklch(55%_0.02_265)]">
          <span>Paso {Math.min(step + 1, total)} de {total}</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[oklch(92%_0.01_255)]">
          <div
            className="h-full rounded-full bg-[oklch(52%_0.13_255)] transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Pasos: todos montados, solo el actual visible. `nativeRequired={false}`
          porque los campos ocultos romperían la validación nativa del submit;
          el stepper valida cada paso manualmente (stepValid). */}
      {steps.map((group, gi) => (
        <div key={gi} hidden={gi !== step} className="space-y-7">
          {group.map((q) => (
            <FieldBlock key={q.id} q={q} nativeRequired={false} />
          ))}
        </div>
      ))}

      {error && <p className="mt-4 text-sm text-[oklch(55%_0.18_25)]">{error}</p>}

      {/* Navegación. Sin backdrop-blur: en iOS Safari un sticky con
          backdrop-filter intercepta/rompe los taps de los hijos (botón). */}
      <div className="mt-7 flex items-center gap-2.5 border-t border-[oklch(92%_0.01_95)] pt-4">
        {step > 0 && (
          <button
            type="button"
            onClick={back}
            className="rounded-xl border border-[oklch(88%_0.01_95)] px-5 py-3 text-base font-medium text-[oklch(40%_0.02_265)] transition active:scale-[0.98]"
          >
            Atrás
          </button>
        )}
        <button
          type={isLast ? "submit" : "button"}
          onClick={isLast ? undefined : next}
          className="flex-1 rounded-xl bg-[oklch(52%_0.13_255)] px-4 py-3.5 text-base font-semibold text-white shadow-md transition hover:bg-[oklch(47%_0.13_255)] active:scale-[0.99]"
        >
          {isLast ? "Enviar respuesta" : "Siguiente"}
        </button>
      </div>
    </form>
  );
}
