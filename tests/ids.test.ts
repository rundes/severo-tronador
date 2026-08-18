import { describe, it, expect } from "vitest";
import { prefixedId } from "@/lib/ids";

describe("prefixedId", () => {
  it("mantiene el prefijo legible", () => {
    expect(prefixedId("cmp")).toMatch(/^cmp-/);
    expect(prefixedId("tpl")).toMatch(/^tpl-/);
  });

  it("no colisiona dentro del mismo milisegundo", () => {
    // Era el bug: la clave era `Date.now().toString(36)` a secas, así que dos
    // creaciones en el mismo milisegundo generaban el MISMO id, y la PK es text.
    const ids = new Set(Array.from({ length: 2000 }, () => prefixedId("cmp")));
    expect(ids.size).toBe(2000);
  });

  it("sigue siendo ordenable por tiempo", async () => {
    const a = prefixedId("cmp");
    await new Promise((r) => setTimeout(r, 2));
    const b = prefixedId("cmp");
    // El timestamp va primero en base36: comparar como string ordena por tiempo
    // mientras el largo del timestamp no cambie (hasta el año 2059).
    expect(a < b).toBe(true);
  });

  it("es seguro en una URL", () => {
    expect(prefixedId("cmp")).toMatch(/^[a-z0-9-]+$/);
  });
});
