import { describe, it, expect } from "vitest";
import { resolveTab } from "@/lib/escucha-tab";

describe("resolveTab", () => {
  it("config es alias de escenario; desconocido → monitor", () => {
    expect(resolveTab("escenario")).toBe("escenario");
    expect(resolveTab("config")).toBe("escenario");
    expect(resolveTab("informe")).toBe("informe");
    expect(resolveTab("monitor")).toBe("monitor");
    expect(resolveTab(undefined)).toBe("monitor");
    expect(resolveTab("x")).toBe("monitor");
  });
});
