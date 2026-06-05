// Modelo de encuestas tipadas. Las preguntas se guardan como jsonb en la
// columna encuestas.preguntas; las respuestas como jsonb en
// encuesta_respuestas.answers. Los ids de pregunta son estables (no índices)
// para sobrevivir reordenamientos sin romper respuestas ya guardadas.

export type QuestionType =
  | "text"
  | "paragraph"
  | "single"
  | "multi"
  | "scale"
  | "boolean";

export interface Question {
  id: string;
  type: QuestionType;
  label: string;
  // Texto de ayuda opcional para contextualizar la pregunta.
  description?: string;
  required: boolean;
  options?: string[]; // single | multi
  min?: number; // scale (default 1)
  max?: number; // scale (default 5)
}

export type AnswerValue = string | string[] | number | boolean;

export interface Answer {
  questionId: string;
  label: string;
  type: QuestionType;
  value: AnswerValue;
}

export type EncuestaEstado = "borrador" | "publicada" | "cerrada";
export type ResponseSource = "publica" | "email" | "manual";

export interface Encuesta {
  id: string;
  projectId: string;
  titulo: string;
  descripcion?: string | null;
  slug?: string | null;
  estado: EncuestaEstado;
  // Diseño de render público (ver lib/encuestas/layouts.ts). Extensible.
  layout: string;
  preguntas: Question[];
  publishedAt?: string | null;
  createdAt: string;
}

export interface EncuestaResponse {
  id?: string;
  projectId: string;
  encuestaId: string;
  source: ResponseSource;
  dni?: string | null;
  token?: string | null;
  answers: Answer[];
  at: string;
}

const SCALE_DEFAULT_MIN = 1;
const SCALE_DEFAULT_MAX = 5;

export function scaleBounds(q: Question): { min: number; max: number } {
  return {
    min: Number.isFinite(q.min) ? (q.min as number) : SCALE_DEFAULT_MIN,
    max: Number.isFinite(q.max) ? (q.max as number) : SCALE_DEFAULT_MAX,
  };
}

// Valida la definición de una pregunta. Devuelve mensaje de error o null.
export function validateQuestion(q: Question): string | null {
  if (!q.label?.trim()) return "Toda pregunta necesita un enunciado.";
  if ((q.type === "single" || q.type === "multi")) {
    const opts = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
    if (opts.length < 2) return `"${q.label}" necesita al menos 2 opciones.`;
  }
  if (q.type === "scale") {
    const { min, max } = scaleBounds(q);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min >= max) {
      return `"${q.label}": el rango de la escala es inválido.`;
    }
  }
  return null;
}

export function validateQuestions(qs: Question[]): string | null {
  if (qs.length === 0) return "La encuesta necesita al menos una pregunta.";
  for (const q of qs) {
    const err = validateQuestion(q);
    if (err) return err;
  }
  return null;
}
