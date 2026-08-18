// Mapeo de columnas del padrón (F6 del plan: módulo prioritario sin cubrir).
//
// Es el punto donde un Sheet ajeno se convierte en el padrón. Un mapeo mal
// adivinado no falla ruidoso: importa 10.000 filas con el teléfono en la columna
// del DNI, y eso se descubre cuando una campaña sale mal.
import { describe, it, expect } from "vitest";
import {
  BASE_FIELD_KEYS,
  bestGuess,
  CONTACT_FIELDS,
  fieldsWithCustom,
} from "@/lib/contactos/mapping";

describe("bestGuess · match exacto", () => {
  it("encuentra la columna por su nombre", () => {
    expect(bestGuess("nombre", ["dni", "nombre", "apellido"])).toBe("nombre");
  });

  it("ignora tildes, mayúsculas y separadores", () => {
    expect(bestGuess("telefono", ["Teléfono"])).toBe("Teléfono");
    expect(bestGuess("fecha_nac", ["Fecha Nacimiento"])).toBe("Fecha Nacimiento");
    expect(bestGuess("email", ["CORREO_ELECTRONICO"])).toBe("CORREO_ELECTRONICO");
  });

  it("reconoce los alias en inglés", () => {
    expect(bestGuess("apellido", ["last_name"])).toBe("last_name");
    expect(bestGuess("nombre", ["first name"])).toBe("first name");
    expect(bestGuess("sexo", ["gender"])).toBe("gender");
  });

  it("el match exacto gana sobre el parcial", () => {
    // "mesa" exacto tiene que ganarle a "mesa_electoral_anterior", que también
    // contiene "mesa": si gana el parcial, se importa la columna equivocada.
    expect(bestGuess("mesa", ["mesa_electoral_anterior", "mesa"])).toBe("mesa");
  });

  it("cae al match parcial cuando no hay exacto", () => {
    expect(bestGuess("mesa", ["numero_de_mesa"])).toBe("numero_de_mesa");
  });

  it("sin candidato devuelve vacío en vez de adivinar", () => {
    // Devolver cualquier cosa acá es lo que corrompe el padrón: mejor que el
    // operador elija.
    expect(bestGuess("dni", ["barrio", "notas"])).toBe("");
  });

  it("con headers vacíos no rompe", () => {
    expect(bestGuess("dni", [])).toBe("");
  });
});

describe("bestGuess · el DNI, que es la clave del padrón", () => {
  it("reconoce las formas usuales", () => {
    for (const h of ["DNI", "documento", "Documento Numero", "identificador", "id"]) {
      expect(bestGuess("dni", [h]), h).toBe(h);
    }
  });

  it("no confunde una columna que sólo contiene 'id' con el DNI cuando hay uno mejor", () => {
    // "id" es alias de dni, pero con "dni" presente el exacto tiene que ganar.
    expect(bestGuess("dni", ["id_interno", "dni"])).toBe("dni");
  });
});

describe("campos del padrón", () => {
  it("el DNI es el único obligatorio", () => {
    const req = CONTACT_FIELDS.filter((f) => f.required).map((f) => f.key);
    expect(req).toEqual(["dni"]);
  });

  it("no hay keys repetidas", () => {
    expect(new Set(BASE_FIELD_KEYS).size).toBe(BASE_FIELD_KEYS.length);
  });

  it("todos los campos tienen etiqueta legible", () => {
    for (const f of CONTACT_FIELDS) {
      expect(f.label, f.key).toBeTruthy();
      expect(f.label).not.toBe(f.key);
    }
  });
});

describe("fieldsWithCustom", () => {
  it("agrega los campos custom del proyecto después de los básicos", () => {
    const out = fieldsWithCustom([{ key: "afinidad", label: "Afinidad" }]);
    expect(out.slice(0, CONTACT_FIELDS.length)).toEqual(CONTACT_FIELDS);
    expect(out[out.length - 1]).toEqual({ key: "afinidad", label: "Afinidad" });
  });

  it("sin custom devuelve los básicos", () => {
    expect(fieldsWithCustom([])).toEqual(CONTACT_FIELDS);
  });

  it("un custom que choca con un básico queda después, no lo reemplaza", () => {
    // BASE_FIELD_KEYS existe justamente para rutear a columna vs jsonb: el
    // orden decide cuál gana en el mapper.
    const out = fieldsWithCustom([{ key: "barrio", label: "Barrio (custom)" }]);
    expect(out.filter((f) => f.key === "barrio")).toHaveLength(2);
    expect(out.findIndex((f) => f.label === "Barrio")).toBeLessThan(
      out.findIndex((f) => f.label === "Barrio (custom)"),
    );
  });
});
