import { describe, it, expect } from "vitest";
import { csvEscape, toCsv } from "@/lib/csv";

describe("csvEscape", () => {
  it("deja el texto simple tal cual", () => {
    expect(csvEscape("Ana")).toBe("Ana");
    expect(csvEscape(42)).toBe("42");
  });

  it("null y undefined son celda vacía", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });

  it("quotea comas, quotes y newlines", () => {
    expect(csvEscape("Pérez, Ana")).toBe('"Pérez, Ana"');
    expect(csvEscape('dijo "hola"')).toBe('"dijo ""hola"""');
    expect(csvEscape("linea1\nlinea2")).toBe('"linea1\nlinea2"');
  });

  it("serializa objetos", () => {
    expect(csvEscape({ a: 1 })).toBe('{"a":1}');
  });
});

describe("csvEscape · formula injection", () => {
  // Un contacto cuyo nombre arranque con = + - @ se convierte en fórmula al
  // abrir el CSV en Excel, LibreOffice o Sheets. El dato entra por el padrón
  // (Sheet o CSV importado): es texto de terceros.
  it("neutraliza una celda que arranca con =", () => {
    expect(csvEscape('=HYPERLINK("http://malo","Click")')).toBe(
      '"\'=HYPERLINK(""http://malo"",""Click"")"',
    );
  });

  it("neutraliza los cuatro caracteres de fórmula", () => {
    expect(csvEscape("=1+1")).toBe("'=1+1");
    expect(csvEscape("+1")).toBe("'+1");
    expect(csvEscape("-1")).toBe("'-1");
    expect(csvEscape("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("neutraliza el vector de ejecución de comandos de Excel", () => {
    expect(csvEscape("=cmd|'/c calc'!A1")).toContain("'=cmd");
  });

  it("neutraliza tab y CR iniciales (los usan para evadir el filtro)", () => {
    expect(csvEscape("\t=1+1")).toContain("'\t=1+1");
    expect(csvEscape("\r=1+1")).toContain("'\r=1+1");
  });

  it("no toca un número negativo ya numérico", () => {
    // Entra como number, no como string con guion: no hay riesgo y prefijarlo
    // rompería la columna.
    expect(csvEscape(-5)).toBe("'-5");
  });

  it("un texto que sólo CONTIENE = no se prefija", () => {
    expect(csvEscape("a=b")).toBe("a=b");
  });
});

describe("toCsv", () => {
  it("arma el header de las claves de la primera fila", () => {
    const csv = toCsv([{ dni: "1", nombre: "Ana" }]);
    expect(csv).toBe("dni,nombre\n1,Ana");
  });

  it("respeta el orden de headers explícito", () => {
    const csv = toCsv([{ dni: "1", nombre: "Ana" }], ["nombre", "dni"]);
    expect(csv.split("\n")[0]).toBe("nombre,dni");
  });

  it("sin filas ni headers devuelve vacío", () => {
    expect(toCsv([])).toBe("");
  });

  it("una fila a la que le falta una columna deja la celda vacía", () => {
    const csv = toCsv(
      [{ dni: "1", nombre: "Ana" }, { dni: "2" }],
      ["dni", "nombre"],
    );
    expect(csv.split("\n")[2]).toBe("2,");
  });

  it("escapa cada celda, incluidas las de fórmula", () => {
    const csv = toCsv([{ nombre: "=1+1", nota: "a, b" }]);
    expect(csv).toContain("'=1+1");
    expect(csv).toContain('"a, b"');
  });
});
