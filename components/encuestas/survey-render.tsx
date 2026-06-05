// Elige el diseño de render de la encuesta según `layout`. Punto único de
// extensión: al sumar un layout nuevo, agregar su caso acá + en lib/.../layouts.
import { SurveyForm } from "@/components/encuestas/survey-form";
import { SurveyStepper } from "@/components/encuestas/survey-stepper";
import type { Question } from "@/lib/encuestas/types";

export function SurveyRender({
  layout,
  questions,
  action,
  hidden,
}: {
  layout: string;
  questions: Question[];
  action: (formData: FormData) => void;
  hidden: Record<string, string>;
}) {
  if (layout === "stepper") {
    return <SurveyStepper questions={questions} action={action} hidden={hidden} />;
  }
  return <SurveyForm questions={questions} action={action} hidden={hidden} />;
}
