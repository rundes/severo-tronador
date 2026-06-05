// Catálogo de diseños de encuesta. Para agregar uno nuevo en el futuro:
//   1. sumar una entrada acá,
//   2. renderizarlo en components/encuestas/survey-render.tsx.
// El selector del editor/creación se arma solo desde esta lista.

export interface LayoutOption {
  id: string;
  label: string;
  description: string;
}

export const SURVEY_LAYOUTS: LayoutOption[] = [
  {
    id: "minimal",
    label: "Minimalista",
    description: "Todas las preguntas en una sola página.",
  },
  {
    id: "stepper",
    label: "Paso a paso",
    description: "Una pregunta por pantalla con barra de progreso.",
  },
];

export const DEFAULT_LAYOUT = "minimal";

export function isLayout(v: string | null | undefined): boolean {
  return SURVEY_LAYOUTS.some((l) => l.id === v);
}

export function normalizeLayout(v: string | null | undefined): string {
  return isLayout(v) ? (v as string) : DEFAULT_LAYOUT;
}
