import { describe, it, expect, beforeEach, vi } from "vitest";

// Stub mínimo del query-builder de supabase-js encadenable.
function makeSupabaseStub(row: unknown) {
  const qb: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "not", "gte", "order", "limit"]) {
    qb[m] = vi.fn(() => qb);
  }
  qb.maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  return qb;
}

beforeEach(() => {
  process.env.SUPABASE_URL = "http://x";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  vi.resetModules();
});

describe("latestSurveyTokenForDni", () => {
  it("devuelve token + campaignId del envío más reciente", async () => {
    const stub = makeSupabaseStub({ token: "tok-1", campaign_id: "camp-1" });
    vi.doMock("@/lib/db/supabase", () => ({
      dbConfigured: () => true,
      getSupabase: () => stub,
    }));
    const { latestSurveyTokenForDni } = await import("@/lib/campaigns");
    const r = await latestSurveyTokenForDni("proj-1", "30111222", "2026-06-01T00:00:00Z");
    expect(r).toEqual({ token: "tok-1", campaignId: "camp-1" });
  });

  it("devuelve null si no hay envío con token", async () => {
    const stub = makeSupabaseStub(null);
    vi.doMock("@/lib/db/supabase", () => ({
      dbConfigured: () => true,
      getSupabase: () => stub,
    }));
    const { latestSurveyTokenForDni } = await import("@/lib/campaigns");
    const r = await latestSurveyTokenForDni("proj-1", "30111222", "2026-06-01T00:00:00Z");
    expect(r).toBeNull();
  });
});
