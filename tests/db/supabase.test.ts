import { describe, it, expect, afterEach, vi } from "vitest";

afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  vi.resetModules();
});

describe("dbConfigured", () => {
  it("false sin env", async () => {
    vi.resetModules();
    const m = await import("@/lib/db/supabase");
    expect(m.dbConfigured()).toBe(false);
  });
});
