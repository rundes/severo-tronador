import { describe, it, expect, vi, beforeEach } from "vitest";

// "Guardar escenario" fallaba con Postgres 42P10: la unique de conector_config
// es (connector_id, project_id) NULLS NOT DISTINCT y el upsert declaraba
// onConflict "connector_id" solo (mismo bug que el token de extensión).
const upsert = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => true,
  getSupabase: () => ({ from: () => ({ upsert }) }),
}));

import { saveMonitorConfig, DEFAULT_BUDGET } from "@/lib/monitor-config";

describe("saveMonitorConfig", () => {
  beforeEach(() => upsert.mockClear());

  it("upsertea con onConflict (connector_id, project_id) y project_id null", async () => {
    await saveMonitorConfig("p1", {
      accounts: [], searchesA: [], searchesB: [], calendar: [], noRepetir: [],
      budget: DEFAULT_BUDGET, entidades: {},
    });
    const [row, opts] = upsert.mock.calls[0];
    expect(row.connector_id).toBe("monitor-config:p1");
    expect(row.project_id).toBeNull();
    expect(opts.onConflict).toBe("connector_id,project_id");
  });
});
