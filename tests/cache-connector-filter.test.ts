import { describe, it, expect } from "vitest";
import { cacheConnectorFilter } from "@/lib/listening";

// La radio (agenda) y las páginas de Facebook (infra/fb-worker) se ingestan
// por fuera del pull y guardan connector_id "radio" / "fb-pages". No son
// `fuentes` togglables, así que el filtro de lectura del feed debe incluirlas
// siempre — si no, quedan ocultas cuando hay fuentes seleccionadas.
describe("cacheConnectorFilter", () => {
  it("sin fuentes → undefined (lee todo, ingestas externas incluidas)", () => {
    expect(cacheConnectorFilter([])).toBeUndefined();
  });

  it("con fuentes → suma 'radio' y 'fb-pages' para no ocultar ingestas externas", () => {
    expect(cacheConnectorFilter(["gdelt", "x"])).toEqual([
      "gdelt", "x", "radio", "fb-pages",
    ]);
  });

  it("no duplica las ingestas externas si ya están", () => {
    expect(cacheConnectorFilter(["radio", "fb-pages"])).toEqual(["radio", "fb-pages"]);
  });
});
