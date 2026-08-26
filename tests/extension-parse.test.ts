import { describe, it, expect } from "vitest";
import { parseCount, countBefore, parseXGroupLabel, parseIgHeader, parseIgOg } from "../infra/escucha-extension/core/parse.js";

describe("parseCount · español", () => {
  it("miles y millones con coma decimal", () => {
    expect(parseCount("38,2 mil")).toBe(38200);
    expect(parseCount("3,4 mil")).toBe(3400);
    expect(parseCount("1,2 M")).toBe(1200000);
    expect(parseCount("1,2 millones")).toBe(1200000);
    expect(parseCount("1,2 millón")).toBe(1200000);
  });
  it("punto como separador de miles", () => {
    expect(parseCount("1.806")).toBe(1806);
    expect(parseCount("1.234.567")).toBe(1234567);
  });
  it("enteros pelados", () => {
    expect(parseCount("12")).toBe(12);
    expect(parseCount("0")).toBe(0);
  });
});

describe("parseCount · inglés", () => {
  it("K y M pegados al número", () => {
    expect(parseCount("136K")).toBe(136000);
    expect(parseCount("3.4K")).toBe(3400);
    expect(parseCount("1.2M")).toBe(1200000);
  });
  it("coma como separador de miles", () => {
    expect(parseCount("1,806")).toBe(1806);
  });
  it("notación mixta: el último separador es el decimal", () => {
    expect(parseCount("1.234,5 mil")).toBe(1234500);
    expect(parseCount("1,234.5K")).toBe(1234500);
  });
});

describe("parseCount · robustez", () => {
  it("null cuando no hay número", () => {
    for (const bad of ["", "   ", "sin datos", null, undefined, {}]) {
      expect(parseCount(bad)).toBeNull();
    }
  });
  it("no confunde palabras que empiezan con m/k con magnitudes", () => {
    expect(parseCount("12 mensajes")).toBe(12);
    expect(parseCount("12 milanesas")).toBe(12);
    expect(parseCount("7 comentarios")).toBe(7);
  });
  it("acepta números ya numéricos", () => {
    expect(parseCount(1806)).toBe(1806);
  });
});

describe("countBefore", () => {
  it("toma el número que precede a la unidad, no el primero del texto", () => {
    expect(countBefore("136K seguidores, 216 seguidos, 16K publicaciones", "publicaciones|posts")).toBe(16000);
    expect(countBefore("136K seguidores, 216 seguidos", "seguidores|followers")).toBe(136000);
  });
  it("null si la unidad no aparece", () => {
    expect(countBefore("216 seguidos", "seguidores|followers")).toBeNull();
  });
});

describe("parseXGroupLabel", () => {
  it("etiqueta en español, con elementos que se ignoran", () => {
    expect(parseXGroupLabel("7 respuestas, 6 reposts, 23 Me gusta, 1 elemento guardado, 1828 reproducciones"))
      .toEqual({ replies: 7, reposts: 6, likes: 23, views: 1828 });
  });
  it("etiqueta en inglés", () => {
    expect(parseXGroupLabel("7 replies, 6 reposts, 23 likes, 1828 views"))
      .toEqual({ replies: 7, reposts: 6, likes: 23, views: 1828 });
  });
  it("etiqueta parcial: sólo las claves presentes", () => {
    expect(parseXGroupLabel("1 respuesta, 2 Me gusta")).toEqual({ replies: 1, likes: 2 });
  });
  it("números localizados dentro de la etiqueta", () => {
    expect(parseXGroupLabel("1.828 reproducciones, 38,2 mil Me gusta")).toEqual({ likes: 38200, views: 1828 });
  });
  it("etiqueta vacía o nula → objeto vacío", () => {
    expect(parseXGroupLabel("")).toEqual({});
    expect(parseXGroupLabel(null)).toEqual({});
  });
});

describe("parseIgHeader / parseIgOg", () => {
  it("seguidores del header", () => {
    expect(parseIgHeader("1.806 publicaciones 136 mil seguidores 216 seguidos")).toBe(136000);
    expect(parseIgHeader("136K followers")).toBe(136000);
    expect(parseIgHeader("sin datos")).toBeNull();
  });
  it("og:description trae seguidores y publicaciones", () => {
    expect(parseIgOg("136K seguidores, 216 seguidos, 16K publicaciones")).toEqual({ followers: 136000, posts: 16000 });
    expect(parseIgOg("")).toEqual({ followers: null, posts: null });
  });
});
