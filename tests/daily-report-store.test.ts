import { describe, it, expect, vi, beforeEach } from "vitest";

// saveReport escribe la fila sintética daily-report:<pid> de conector_config.
// Se mockea la persistencia (lectura y escritura) para observar exactamente
// qué store quedaría guardado.
let fila: unknown = null;
const upsertConectorConfig = vi.fn(async (_k: string, cfg: unknown) => { fila = cfg; });
vi.mock("@/lib/db/conector-config", () => ({
  upsertConectorConfig: (...a: unknown[]) => upsertConectorConfig(...(a as [string, unknown])),
}));

let guardado: { latest: unknown; history: unknown[] } | null = null;
const maybeSingle = vi.fn(async () => ({ data: guardado ? { config: guardado } : null }));
vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => true,
  getSupabase: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) }),
}));

import { saveReport, type DailyReport } from "@/lib/daily-report";

type Store = { latest: DailyReport; history: DailyReport[] };
const rep = (at: string, markdown = `cuerpo ${at}`): DailyReport => ({ at, markdown, items24h: 0, items7d: 0 });
const store = (): Store => fila as Store;

describe("saveReport · orden por fecha", () => {
  beforeEach(() => {
    fila = null;
    guardado = null;
    upsertConectorConfig.mockClear();
  });

  it("sin nada previo: el informe queda como latest y el historial vacío", async () => {
    await saveReport("p1", rep("2026-08-26T15:00:00.000Z"));
    expect(store().latest.at).toBe("2026-08-26T15:00:00.000Z");
    expect(store().history).toEqual([]);
  });

  it("un informe nuevo desplaza al anterior al historial", async () => {
    guardado = { latest: rep("2026-08-25T15:00:00.000Z"), history: [rep("2026-08-24T15:00:00.000Z")] };
    await saveReport("p1", rep("2026-08-26T15:00:00.000Z"));
    expect(store().latest.at).toBe("2026-08-26T15:00:00.000Z");
    expect(store().history.map((r) => r.at)).toEqual([
      "2026-08-25T15:00:00.000Z",
      "2026-08-24T15:00:00.000Z",
    ]);
  });

  it("una importación con fecha vieja NO se vuelve el último informe", async () => {
    guardado = { latest: rep("2026-08-26T15:00:00.000Z"), history: [rep("2026-08-25T15:00:00.000Z")] };
    await saveReport("p1", rep("2026-08-20T09:00:00.000Z", "informe viejo importado"));
    expect(store().latest.at).toBe("2026-08-26T15:00:00.000Z");
    expect(store().history.map((r) => r.at)).toEqual([
      "2026-08-25T15:00:00.000Z",
      "2026-08-20T09:00:00.000Z",
    ]);
  });

  it("el historial queda ordenado de más nuevo a más viejo aunque la fila lo estuviera", async () => {
    guardado = {
      latest: rep("2026-08-20T15:00:00.000Z"),
      history: [rep("2026-08-26T15:00:00.000Z"), rep("2026-08-22T15:00:00.000Z")],
    };
    await saveReport("p1", rep("2026-08-23T15:00:00.000Z"));
    expect(store().latest.at).toBe("2026-08-26T15:00:00.000Z");
    expect(store().history.map((r) => r.at)).toEqual([
      "2026-08-23T15:00:00.000Z",
      "2026-08-22T15:00:00.000Z",
      "2026-08-20T15:00:00.000Z",
    ]);
  });

  it("capea el historial en 14 y recorta el markdown a 4000", async () => {
    guardado = {
      latest: rep("2026-08-25T15:00:00.000Z", "x".repeat(9000)),
      history: Array.from({ length: 20 }, (_, i) => rep(`2026-08-${String(24 - i).padStart(2, "0")}T15:00:00.000Z`, "y".repeat(9000))),
    };
    await saveReport("p1", rep("2026-08-26T15:00:00.000Z", "z".repeat(9000)));
    expect(store().latest.markdown).toHaveLength(9000);
    expect(store().history).toHaveLength(14);
    for (const r of store().history) expect(r.markdown).toHaveLength(4000);
  });
});
