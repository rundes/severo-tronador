// Lógica pura del stepper de encuestas, extraída del componente para poder
// testearla sin DOM. Acá vive la regla que evita la finalización prematura.
import type { Question } from "./types";

// ¿Está completo el paso? Todas las preguntas requeridas respondidas. El
// stepper valida manualmente (no usa `required` nativo, porque monta todos los
// pasos ocultos y un control oculto con required rompe el submit nativo).
export function stepComplete(
  questions: Question[],
  isAnswered: (q: Question) => boolean,
): boolean {
  return questions.every((q) => !q.required || isAnswered(q));
}

export type SubmitOutcome = "advance" | "block" | "finalize";

// Qué hacer ante un submit del form. Regla clave anti finalización prematura:
// si NO estás en el último paso (ej. Enter en un campo de un paso intermedio,
// que dispara submit implícito), se AVANZA, nunca se finaliza. Solo el último
// paso, con sus requeridas completas, finaliza; si faltan, se bloquea.
export function resolveSubmit(
  isLast: boolean,
  complete: boolean,
): SubmitOutcome {
  if (!isLast) return "advance";
  return complete ? "finalize" : "block";
}

export function nextStep(step: number, total: number): number {
  return Math.min(step + 1, total - 1);
}

export function prevStep(step: number): number {
  return Math.max(step - 1, 0);
}
