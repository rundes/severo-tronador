import { describe, it, expect, vi, beforeEach } from "vitest";

// Regresión 2026-08-25: "Generar token de extensión" fallaba para un owner con
// Postgres 42P10 ("no unique or exclusion constraint matching the ON CONFLICT
// specification"). El upsert apuntaba a onConflict "connector_id", pero la
// unique de conector_config es (connector_id, project_id) nulls not distinct
// (migración 0053). El token vive con project_id NULL (el proyecto va dentro
// del connector_id), así que el conflicto debe declararse sobre ambas columnas.
const upsert = vi.fn().mockResolvedValue({ error: null });
const maybeSingle = vi.fn();
vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => true,
  getSupabase: () => ({
    from: () => ({
      upsert,
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }),
  }),
}));

import { issueExtensionToken, verifyExtensionToken } from "@/lib/extension-token";

const PID = "b06f7ba4-3e3e-4392-bde9-a0df600f3cf2";

describe("extension-token", () => {
  beforeEach(() => {
    upsert.mockClear();
    maybeSingle.mockReset();
  });

  it("issue: upsert declara el conflicto sobre (connector_id, project_id) con project_id null", async () => {
    const token = await issueExtensionToken(PID);
    expect(token.startsWith(`${PID}.`)).toBe(true);
    expect(token.slice(PID.length + 1)).toMatch(/^[0-9a-f]{48}$/);
    expect(upsert).toHaveBeenCalledTimes(1);
    const [row, opts] = upsert.mock.calls[0];
    expect(row.connector_id).toBe(`extension-token:${PID}`);
    expect(row.project_id).toBeNull();
    expect(opts.onConflict).toBe("connector_id,project_id");
  });

  it("issue: propaga el error de la DB en vez de tragarlo", async () => {
    upsert.mockResolvedValueOnce({ error: { code: "42P10", message: "no unique" } });
    await expect(issueExtensionToken(PID)).rejects.toMatchObject({ code: "42P10" });
  });

  it("verify: acepta el token recién emitido y rechaza otro secreto", async () => {
    const token = await issueExtensionToken(PID);
    const storedHash = upsert.mock.calls[0][0].config.hash;
    maybeSingle.mockResolvedValue({ data: { config: { hash: storedHash } } });
    expect(await verifyExtensionToken(token)).toBe(PID);
    expect(await verifyExtensionToken(`${PID}.${"0".repeat(48)}`)).toBeNull();
    expect(await verifyExtensionToken("garbage")).toBeNull();
  });
});
