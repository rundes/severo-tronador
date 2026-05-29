import { describe, it, expect } from "vitest";
import {
  buildVarMap,
  interpolateWithMap,
  extractUsedVars,
  SUPPORTED_VAR_KEYS,
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
const NOW = Date.parse("2026-05-28T10:00:00-03:00");

describe("buildVarMap", () => {
  it("incluye todas las SUPPORTED_VARS resueltas", () => {
    const map = buildVarMap(ana, { now: NOW });
    for (const v of SUPPORTED_VARS) {
      expect(map).toHaveProperty(v.key);
    }
  });

  it("campos del contacto se resuelven directo", () => {
    const map = buildVarMap(ana, { now: NOW });
    expect(map.nombre).toBe("Ana");
    expect(map.barrio).toBe("Centro");
  });

  it("vars derivadas tienen valor (saludo, fecha_humana, firma)", () => {
    const map = buildVarMap(ana, { now: NOW });
    expect(map.saludo).toBe("Buenos días");
    expect(map.fecha_humana).toMatch(/\w+ \d+ de \w+/);
    expect(map.firma).toContain("Equipo de relevamiento");
  });

  it("vars sin valor usan fallback", () => {
    const sinBarrio: Contact = { dni: "2", nombre: "X", apellido: "Y" };
    const map = buildVarMap(sinBarrio, { now: NOW });
    expect(map.barrio).toBe("tu zona");
  });

  it("encuesta_url viene del context", () => {
    const map = buildVarMap(ana, { now: NOW, surveyUrl: "https://x.y/abc" });
    expect(map.encuesta_url).toBe("https://x.y/abc");
  });
});

describe("interpolateWithMap", () => {
  it("reemplaza variables del map", () => {
    const r = interpolateWithMap("Hola {{nombre}} de {{barrio}}", {
      nombre: "Ana",
      barrio: "Centro",
    });
    expect(r).toBe("Hola Ana de Centro");
  });

  it("var inexistente queda vacía", () => {
    const r = interpolateWithMap("X {{noexiste}} Y", { nombre: "Ana" });
    expect(r).toBe("X  Y");
  });

  it("trim de espacios en la var", () => {
    const r = interpolateWithMap("{{ nombre }}", { nombre: "Ana" });
    expect(r).toBe("Ana");
  });

  it("sin variables devuelve texto idéntico", () => {
    expect(interpolateWithMap("Plain text", {})).toBe("Plain text");
  });
});

describe("extractUsedVars", () => {
  it("extrae todas las variables únicas", () => {
    const vars = extractUsedVars("{{a}} y {{b}} y otra vez {{a}}");
    expect(vars).toEqual(["a", "b"]);
  });

  it("acepta espacios alrededor", () => {
    expect(extractUsedVars("{{ x }}")).toEqual(["x"]);
  });

  it("ignora texto sin variables", () => {
    expect(extractUsedVars("Hola mundo")).toEqual([]);
  });

  it("ignora llaves sin cerrar", () => {
    expect(extractUsedVars("{{ broken")).toEqual([]);
  });
});

describe("SUPPORTED_VAR_KEYS", () => {
  it("es un set con todas las keys de SUPPORTED_VARS", () => {
    expect(SUPPORTED_VAR_KEYS.size).toBe(SUPPORTED_VARS.length);
    for (const v of SUPPORTED_VARS) {
      expect(SUPPORTED_VAR_KEYS.has(v.key)).toBe(true);
    }
  });
});
