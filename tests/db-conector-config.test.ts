import { describe, it, expect, vi, beforeEach } from "vitest";

// Todas las filas sintéticas de conector_config (monitor-config:<pid>,
// daily-report:<pid>, extension-token:<pid>, listening-pull:<pid>,
// monitor-breaker:<pid>) viven con project_id NULL bajo una unique
// (connector_id, project_id) NULLS NOT DISTINCT. Cada call site repetía el
// upsert a mano y tres de seis tenían onConflict "connector_id" → 42P10.
const upsert = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => true,
  getSupabase: () => ({ from: (t: string) => ({ upsert: (...a: unknown[]) => upsert(t, ...a) }) }),
}));

import { upsertConectorConfig } from "@/lib/db/conector-config";

describe("upsertConectorConfig", () => {
  beforeEach(() => upsert.mockClear());

  it("upsertea en conector_config con project_id null y onConflict (connector_id, project_id)", async () => {
    await upsertConectorConfig("monitor-config:p1", { a: 1 });
    const [table, row, opts] = upsert.mock.calls[0];
    expect(table).toBe("conector_config");
    expect(row).toMatchObject({ connector_id: "monitor-config:p1", project_id: null, config: { a: 1 } });
    expect(typeof row.updated_at).toBe("string");
    expect(opts).toEqual({ onConflict: "connector_id,project_id" });
  });

  it("propaga el error de la DB", async () => {
    upsert.mockResolvedValueOnce({ error: { code: "42P10", message: "x" } });
    await expect(upsertConectorConfig("k", {})).rejects.toMatchObject({ code: "42P10" });
  });
});
