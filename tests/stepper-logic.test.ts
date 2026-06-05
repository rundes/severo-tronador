import { describe, it, expect } from "vitest";
import {
  stepComplete,
  resolveSubmit,
  nextStep,
  prevStep,
} from "@/lib/encuestas/stepper-logic";
import { buildSteps, type Question } from "@/lib/encuestas/types";

function q(id: string, required: boolean, step?: number): Question {
  return { id, type: "text", label: id, required, step };
}

describe("resolveSubmit — anti finalización prematura", () => {
  it("un submit en un paso NO final siempre avanza (nunca finaliza)", () => {
    // Caso del bug: Enter en un campo de un paso intermedio dispara submit.
    expect(resolveSubmit(false, true)).toBe("advance");
    expect(resolveSubmit(false, false)).toBe("advance");
  });

  it("el último paso solo finaliza si está completo; si no, bloquea", () => {
    expect(resolveSubmit(true, true)).toBe("finalize");
    expect(resolveSubmit(true, false)).toBe("block");
  });
});

describe("stepComplete", () => {
  const answered = (set: Set<string>) => (qq: Question) => set.has(qq.id);

  it("las opcionales no bloquean", () => {
    const qs = [q("a", false), q("b", false)];
    expect(stepComplete(qs, answered(new Set()))).toBe(true);
  });

  it("una requerida sin responder bloquea; respondida pasa", () => {
    const qs = [q("a", true), q("b", false)];
    expect(stepComplete(qs, answered(new Set()))).toBe(false);
    expect(stepComplete(qs, answered(new Set(["a"])))).toBe(true);
  });
});

describe("nextStep / prevStep — límites", () => {
  it("no pasa del último ni baja del primero", () => {
    expect(nextStep(0, 3)).toBe(1);
    expect(nextStep(2, 3)).toBe(2);
    expect(prevStep(0)).toBe(0);
    expect(prevStep(2)).toBe(1);
  });
});

describe("buildSteps + flujo: la última tanda existe y se finaliza recién al final", () => {
  it("modo manual agrupa por step y conserva todas las tandas", () => {
    const qs = [q("a", true, 1), q("b", false, 1), q("c", true, 2)];
    const steps = buildSteps(qs, "manual");
    expect(steps.length).toBe(2);
    expect(steps[1].map((x) => x.id)).toEqual(["c"]);

    // Recorrido: en el paso 0 (no último) un submit avanza, no finaliza.
    expect(resolveSubmit(0 >= steps.length - 1, true)).toBe("advance");
    // En el último paso, con la requerida respondida, finaliza.
    const answered = (qq: Question) => qq.id === "c";
    const lastComplete = stepComplete(steps[1], answered);
    expect(resolveSubmit(1 >= steps.length - 1, lastComplete)).toBe("finalize");
  });
});
