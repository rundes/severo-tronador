import { describe, it, expect } from "vitest";
import { detectOptOut } from "@/lib/inbound";

describe("detectOptOut", () => {
  it("detecta keywords exactas (case/space-insensitive)", () => {
    expect(detectOptOut("BAJA")).toBe("BAJA");
    expect(detectOptOut(" stop ")).toBe("STOP");
    expect(detectOptOut("Cancelar")).toBe("CANCELAR");
    expect(detectOptOut("baja total")).toBe("BAJA TOTAL");
  });
  it("no matchea frases que contienen la palabra", () => {
    expect(detectOptOut("no me des de baja por favor")).toBeNull();
    expect(detectOptOut("quiero parar esto")).toBeNull();
  });
  it("texto normal → null", () => {
    expect(detectOptOut("me preocupa la inseguridad")).toBeNull();
  });
});
