import { describe, it, expect } from "vitest";
import { parseAnswers } from "@/lib/encuestas/answer-parse";
import type { Question } from "@/lib/encuestas/types";

const QS: Question[] = [
  { id: "t", type: "text", label: "Nombre", required: true },
  { id: "s", type: "single", label: "Color", required: true, options: ["Rojo", "Azul"] },
  { id: "m", type: "multi", label: "Hobbies", required: false, options: ["Leer", "Correr"] },
  { id: "sc", type: "scale", label: "Nivel", required: false, min: 1, max: 5 },
  { id: "b", type: "boolean", label: "¿Vecino?", required: true },
];

function fd(entries: [string, string][]): FormData {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
}

describe("parseAnswers", () => {
  it("parsea una respuesta válida completa", () => {
    const r = parseAnswers(
      QS,
      fd([
        ["q_t", "Ana"],
        ["q_s", "Rojo"],
        ["q_m", "Leer"],
        ["q_m", "Correr"],
        ["q_sc", "4"],
        ["q_b", "Sí"],
      ]),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.answers.find((a) => a.questionId === "m")?.value).toEqual(["Leer", "Correr"]);
      expect(r.answers.find((a) => a.questionId === "sc")?.value).toBe(4);
      expect(r.answers.find((a) => a.questionId === "b")?.value).toBe(true);
    }
  });

  it("falla si falta una requerida", () => {
    const r = parseAnswers(QS, fd([["q_s", "Rojo"], ["q_b", "No"]]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Nombre/);
  });

  it("rechaza opción única fuera del allowlist", () => {
    const r = parseAnswers(QS, fd([["q_t", "x"], ["q_s", "Verde"], ["q_b", "Sí"]]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/inválida/i);
  });

  it("descarta valores multi que no son opciones", () => {
    const r = parseAnswers(
      QS,
      fd([["q_t", "x"], ["q_s", "Azul"], ["q_m", "Hackear"], ["q_b", "No"]]),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.answers.find((a) => a.questionId === "m")).toBeUndefined();
  });

  it("acepta opción con espacios al borde en la definición (single)", () => {
    const qs: Question[] = [
      { id: "g", type: "single", label: "Gobierno", required: true, options: ["Debería continuar ", "Ya cumplió un ciclo "] },
    ];
    const r = parseAnswers(qs, fd([["q_g", "Debería continuar "]]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.answers[0].value).toBe("Debería continuar");
  });

  it("rechaza escala fuera de rango", () => {
    const r = parseAnswers(
      QS,
      fd([["q_t", "x"], ["q_s", "Azul"], ["q_sc", "9"], ["q_b", "No"]]),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/rango/i);
  });
});
