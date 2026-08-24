import { describe, it, expect } from "vitest";
import { tokenize, isContentWord } from "@/lib/text/tokenize";

// Ibicuy 2026-08-24: "agosto", "lunes", "general", "lindo", "nacional"
// aparecían como temas emergentes y tags. Son calendario / adjetivos vacíos /
// genéricos: no dicen nada del territorio.
describe("tokenize · stopwords genéricas", () => {
  it("quita meses y días de la semana", () => {
    const got = tokenize("el lunes 16 de agosto y el martes de septiembre");
    expect(got).toEqual([]);
  });

  it("quita adjetivos y adverbios vacíos", () => {
    const got = tokenize("muy lindo recuerdo, gran obra nueva, importante e increible");
    expect(got).toEqual(["recuerdo", "obra"]);
  });

  it("quita genéricos institucionales sin contenido territorial", () => {
    const got = tokenize("informacion oficial general nacional provincial municipal comunidad");
    expect(got).toEqual([]);
  });

  it("quita ruido de títulos de medios y stickers", () => {
    expect(tokenize("Detención de Rosatelli | Análisis — Noticias GIPHY")).toEqual([
      "detencion", "rosatelli",
    ]);
  });

  it("conserva palabras-tema reales", () => {
    expect(tokenize("inundaciones en islas del ibicuy y caza furtiva")).toEqual([
      "inundaciones", "islas", "ibicuy", "caza", "furtiva",
    ]);
    expect(isContentWord("inundaciones")).toBe(true);
    expect(isContentWord("agosto")).toBe(false);
  });
});
