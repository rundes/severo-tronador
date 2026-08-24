import { describe, it, expect } from "vitest";
import { classifySentiment } from "@/lib/sentiment";

// Regresión 2026-08-24: al sumar "lindo"/"bueno"/"malo" a las STOPWORDS del
// tokenizer (no son temas), el clasificador — que tokenizaba con stopwords —
// dejó de verlas y el pulso de Ibicuy cayó de 21+ a 7+. El léxico de
// sentimiento se evalúa sobre TODAS las palabras, no sobre las de contenido.
describe("classifySentiment · independiente de las stopwords de temas", () => {
  it("detecta positivo aunque la palabra sea stopword para temas", () => {
    expect(classifySentiment("Muy lindo recuerdo").sentiment).toBe("positive");
    expect(classifySentiment("Excelente gestión, muy bueno").sentiment).toBe("positive");
  });

  it("detecta negativo aunque la palabra sea stopword para temas", () => {
    expect(classifySentiment("Mala gestión, muy malo todo").sentiment).toBe("negative");
  });

  it("sigue ignorando URLs y ruido de plataforma", () => {
    expect(classifySentiment("posted https://x.com/abc").sentiment).toBe("neutral");
  });
});
