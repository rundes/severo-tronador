import { describe, it, expect } from "vitest";
import { parsePadronCsv } from "@/lib/db/padron";

describe("parsePadronCsv", () => {
  it("mapea headers a Contact", () => {
    const csv = "dni,nombre,apellido,barrio\n123,Ana,Lopez,Centro\n456,Juan,Diaz,Norte";
    const rows = parsePadronCsv(csv);
    expect(rows.length).toBe(2);
    expect(rows[0]).toMatchObject({ dni: "123", nombre: "Ana", barrio: "Centro" });
  });
});
