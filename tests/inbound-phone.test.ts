import { describe, it, expect } from "vitest";
import { normalizePhone } from "@/lib/inbound";

describe("normalizePhone", () => {
  it("ya en E.164 con +54", () => {
    expect(normalizePhone("+5491122223333")).toBe("5491122223333");
  });
  it("limpia espacios y guiones", () => {
    expect(normalizePhone("+54 911 2222-3333")).toBe("5491122223333");
  });
  it("agrega prefijo país AR si falta (número local de 10)", () => {
    expect(normalizePhone("1122223333")).toBe("541122223333");
  });
  it("número que ya empieza con 54 no se duplica", () => {
    expect(normalizePhone("541122223333")).toBe("541122223333");
  });
  it("devuelve null si no hay dígitos", () => {
    expect(normalizePhone("---")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});
