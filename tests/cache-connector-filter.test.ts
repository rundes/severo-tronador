import { describe, it, expect } from "vitest";
import { cacheConnectorFilter } from "@/lib/listening";

// La radio se ingesta aparte (agenda) y guarda menciones con connector_id
// "radio". No es una `fuente` togglable, así que el filtro de lectura del feed
// debe incluirla siempre — si no, queda oculta cuando hay fuentes seleccionadas.
describe("cacheConnectorFilter", () => {
  it("sin fuentes → undefined (lee todo, radio incluida)", () => {
    expect(cacheConnectorFilter([])).toBeUndefined();
  });

  it("con fuentes → suma 'radio' para no ocultar menciones de radio", () => {
    expect(cacheConnectorFilter(["gdelt", "x"])).toEqual(["gdelt", "x", "radio"]);
  });

  it("no duplica 'radio' si ya está", () => {
    expect(cacheConnectorFilter(["radio"])).toEqual(["radio"]);
  });
});
