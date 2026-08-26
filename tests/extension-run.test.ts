import { describe, it, expect, vi, beforeEach } from "vitest";
const upsert = vi.fn(async () => {});
let stored: unknown = null;
vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => true,
  getSupabase: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: stored === undefined ? null : { config: stored } }) }) }) }) }),
}));
vi.mock("@/lib/db/conector-config", () => ({ upsertConectorConfig: (...a: unknown[]) => upsert(...(a as [])) }));
import { saveExtensionRun, readExtensionRun } from "@/lib/extension-run";

describe("saveExtensionRun", () => {
  beforeEach(() => upsert.mockClear());
  it("recorta errores a 50 y agrega at", async () => {
    const errores = Array.from({ length: 60 }, (_, i) => ({ platform: "x", step: "feed", detail: `e${i}` }));
    await saveExtensionRun("p1", { cuentas: 1, busquedas: 2, items: 3, candidatos: 4, sugeridos: 5, errores });
    const [key, cfg] = upsert.mock.calls[0] as unknown as [string, { errores: unknown[]; at: string; cuentas: number }];
    expect(key).toBe("extension-run:p1");
    expect(cfg.errores).toHaveLength(50);
    expect(cfg.cuentas).toBe(1);
    expect(cfg.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("readExtensionRun", () => {
  it("null si no hay fila", async () => {
    stored = undefined;
    expect(await readExtensionRun("p1")).toBeNull();
  });
  it("fila bien formada se devuelve tal cual", async () => {
    stored = { cuentas: 6, busquedas: 4, items: 41, candidatos: 12, sugeridos: 2, errores: [{ platform: "instagram", step: "feed", detail: "HTTP 400" }], at: "2026-08-26T10:00:00.000Z" };
    expect(await readExtensionRun("p1")).toEqual(stored);
  });
  it("fila malformada se normaliza sin lanzar", async () => {
    stored = { cuentas: "6", items: null, errores: "no-es-array", at: 123 };
    const run = await readExtensionRun("p1");
    expect(run).not.toBeNull();
    expect(run?.errores).toEqual([]);
    expect(run?.cuentas).toBe(0);
    expect(run?.items).toBe(0);
    expect(run?.busquedas).toBe(0);
    expect(typeof run?.at).toBe("string");
  });
  it("errores con entradas inválidas se filtran; config que no es objeto → null", async () => {
    stored = { cuentas: 1, busquedas: 0, items: 0, candidatos: 0, sugeridos: 0, errores: [null, { platform: "x" }, { platform: "x", step: "feed", detail: "ok" }], at: "2026-08-26T10:00:00.000Z" };
    expect((await readExtensionRun("p1"))?.errores).toEqual([{ platform: "x", step: "feed", detail: "ok" }]);
    stored = "basura";
    expect(await readExtensionRun("p1")).toBeNull();
  });
});
