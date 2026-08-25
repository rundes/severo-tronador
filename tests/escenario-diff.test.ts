import { describe, it, expect } from "vitest";
import { diffLabel } from "@/lib/escenario-diff";

describe("diffLabel", () => {
  it("cuenta altas y bajas entre vigente y propuesto", () => {
    expect(diffLabel(["a", "b"], ["b", "c"])).toBe("vigente 2 → propuesto 2 (+1 −1)");
  });

  it("sin propuesta no hay etiqueta", () => {
    expect(diffLabel(["a"], undefined)).toBeUndefined();
  });
});
