// Parseo + validación server-side de las respuestas de una encuesta, desde el
// FormData del form público/tokenizado. Cada input se nombra `q_<questionId>`.
// Valida contra la definición (required, options allowlist, rango de escala,
// caps de longitud) para que no entre basura/inyección a la DB.
import {
  type Answer,
  type Question,
  scaleBounds,
} from "@/lib/encuestas/types";

const TEXT_CAP = 2000;

export type ParseResult =
  | { ok: true; answers: Answer[] }
  | { ok: false; error: string };

export function parseAnswers(
  questions: Question[],
  formData: FormData,
): ParseResult {
  const answers: Answer[] = [];

  for (const q of questions) {
    const field = `q_${q.id}`;

    if (q.type === "multi") {
      const picked = formData
        .getAll(field)
        .map((v) => String(v))
        .filter((v) => (q.options ?? []).includes(v));
      if (q.required && picked.length === 0) {
        return { ok: false, error: `Falta responder: ${q.label}` };
      }
      if (picked.length > 0) {
        answers.push({ questionId: q.id, label: q.label, type: q.type, value: picked });
      }
      continue;
    }

    const raw = String(formData.get(field) ?? "").trim();
    if (!raw) {
      if (q.required) return { ok: false, error: `Falta responder: ${q.label}` };
      continue;
    }

    if (q.type === "single") {
      if (!(q.options ?? []).includes(raw)) {
        return { ok: false, error: `Opción inválida en: ${q.label}` };
      }
      answers.push({ questionId: q.id, label: q.label, type: q.type, value: raw });
    } else if (q.type === "boolean") {
      const yes = raw === "Sí" || raw === "Si" || raw === "true";
      answers.push({ questionId: q.id, label: q.label, type: q.type, value: yes });
    } else if (q.type === "scale") {
      const { min, max } = scaleBounds(q);
      const n = Number(raw);
      if (!Number.isInteger(n) || n < min || n > max) {
        return { ok: false, error: `Valor fuera de rango en: ${q.label}` };
      }
      answers.push({ questionId: q.id, label: q.label, type: q.type, value: n });
    } else {
      // text | paragraph
      answers.push({
        questionId: q.id,
        label: q.label,
        type: q.type,
        value: raw.slice(0, TEXT_CAP),
      });
    }
  }

  return { ok: true, answers };
}
