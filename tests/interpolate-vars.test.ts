import { describe, it, expect } from "vitest";
import {
  interpolateExtended,
  SUPPORTED_VARS,
} from "@/lib/interpolate-vars";
import type { Contact } from "@/lib/connectors/types";

const ana: Contact = {
  dni: "1",
  nombre: "Ana",
  apellido: "Diaz",
  barrio: "Centro",
  email: "a@x.com",
};

const NOW_AM = Date.parse("2026-05-28T10:00:00-03:00");
const NOW_PM = Date.parse("2026-05-28T20:00:00-03:00");
const NOW_NOON = Date.parse("2026-05-28T13:00:00-03:00");

describe("interpolateExtended", () => {
  it("reemplaza campos directos del contacto", () => {
    expect(
      interpolateExtended("Hola {{nombre}}, somos del {{barrio}}", ana, {
        now: NOW_AM,
      }),
    ).toBe("Hola Ana, somos del Centro");
  });

  it("usa fallback cuando el campo es undefined", () => {
    const noBarrio: Contact = { dni: "2", nombre: "X", apellido: "Y" };
    expect(
      interpolateExtended("Vivís en {{barrio}}.", noBarrio, { now: NOW_AM }),
    ).toBe("Vivís en tu zona.");
  });

  it("var desconocida → string vacío", () => {
    expect(
      interpolateExtended("X {{noexiste}} Y", ana, { now: NOW_AM }),
    ).toBe("X  Y");
  });

  it("{{saludo}} según hora", () => {
    expect(interpolateExtended("{{saludo}}", ana, { now: NOW_AM })).toBe(
      "Buenos días",
    );
    expect(interpolateExtended("{{saludo}}", ana, { now: NOW_NOON })).toBe(
      "Buenas tardes",
    );
    expect(interpolateExtended("{{saludo}}", ana, { now: NOW_PM })).toBe(
      "Buenas noches",
    );
  });

  it("{{fecha_humana}} formato ES", () => {
    const r = interpolateExtended("Hoy es {{fecha_humana}}", ana, {
      now: Date.parse("2026-05-28T12:00:00Z"),
    });
    expect(r).toMatch(/Hoy es \w+ \d+ de \w+/);
  });

  it("{{fecha_iso}} YYYY-MM-DD", () => {
    const r = interpolateExtended("{{fecha_iso}}", ana, {
      now: Date.parse("2026-05-28T12:00:00Z"),
    });
    expect(r).toBe("2026-05-28");
  });

  it("{{nombre_apellido}} concatena", () => {
    expect(
      interpolateExtended("{{nombre_apellido}}", ana, { now: NOW_AM }),
    ).toBe("Ana Diaz");
  });

  it("{{iniciales}} usa primeras letras", () => {
    expect(
      interpolateExtended("{{iniciales}}", ana, { now: NOW_AM }),
    ).toBe("AD");
  });

  it("{{encuesta_url}} viene del context", () => {
    expect(
      interpolateExtended("Click: {{encuesta_url}}", ana, {
        now: NOW_AM,
        surveyUrl: "https://t.x/abc",
      }),
    ).toBe("Click: https://t.x/abc");
  });

  it("{{firma}} incluye ORG_NAME", () => {
    const r = interpolateExtended("{{firma}}", ana, { now: NOW_AM });
    expect(r).toContain("Equipo de relevamiento");
  });

  it("preserva espacios alrededor de la var", () => {
    expect(
      interpolateExtended("{{ nombre }} y {{nombre}}", ana, { now: NOW_AM }),
    ).toBe("Ana y Ana");
  });

  it("SUPPORTED_VARS incluye las claves esperadas", () => {
    const keys = SUPPORTED_VARS.map((v) => v.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "nombre",
        "apellido",
        "barrio",
        "encuesta_url",
        "saludo",
        "fecha_humana",
        "firma",
      ]),
    );
  });
});
