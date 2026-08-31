import { describe, it, expect } from "vitest";
import { resolveTab } from "@/lib/escucha-tab";

describe("resolveTab", () => {
  it("orden nuevo: informe es el default; monitoreo y entorno resuelven directo", () => {
    expect(resolveTab(undefined)).toBe("informe");
    expect(resolveTab("informe")).toBe("informe");
    expect(resolveTab("monitoreo")).toBe("monitoreo");
    expect(resolveTab("entorno")).toBe("entorno");
    expect(resolveTab("x")).toBe("informe");
  });

  it("aliases viejos (favoritos, mails, redirects de actions) siguen andando", () => {
    expect(resolveTab("escenario")).toBe("entorno");
    expect(resolveTab("config")).toBe("entorno");
    expect(resolveTab("monitor")).toBe("monitoreo");
  });
});
