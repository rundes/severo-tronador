import { describe, it, expect, vi, beforeEach } from "vitest";

// Mismo patrón que tests/extension-token.test.ts: el token vive en una fila
// sintética de conector_config con project_id NULL, así que el upsert declara
// el conflicto sobre (connector_id, project_id) o Postgres tira 42P10.
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

import { issueMcpToken, verifyMcpToken, rotateMcpToken, mcpUrl } from "@/lib/mcp-token";

const PID = "b06f7ba4-3e3e-4392-bde9-a0df600f3cf2";

describe("mcp-token", () => {
  beforeEach(() => {
    upsert.mockClear();
    maybeSingle.mockReset();
  });

  it("issue: guarda solo el hash en mcp-token:<pid> con project_id null", async () => {
    const token = await issueMcpToken(PID);
    expect(token.startsWith(`${PID}.`)).toBe(true);
    expect(token.slice(PID.length + 1)).toMatch(/^[0-9a-f]{48}$/);
    expect(upsert).toHaveBeenCalledTimes(1);
    const [row, opts] = upsert.mock.calls[0];
    expect(row.connector_id).toBe(`mcp-token:${PID}`);
    expect(row.project_id).toBeNull();
    expect(opts.onConflict).toBe("connector_id,project_id");
    // El plaintext NUNCA se guarda: solo su sha256.
    expect(JSON.stringify(row.config)).not.toContain(token.slice(PID.length + 1));
    expect(row.config.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("issue: propaga el error de la DB en vez de tragarlo", async () => {
    upsert.mockResolvedValueOnce({ error: { code: "42P10", message: "no unique" } });
    await expect(issueMcpToken(PID)).rejects.toMatchObject({ code: "42P10" });
  });

  it("verify: acepta el token recién emitido y rechaza cualquier otro", async () => {
    const token = await issueMcpToken(PID);
    const storedHash = upsert.mock.calls[0][0].config.hash;
    maybeSingle.mockResolvedValue({ data: { config: { hash: storedHash } } });
    expect(await verifyMcpToken(token)).toBe(PID);
    expect(await verifyMcpToken(`${PID}.${"0".repeat(48)}`)).toBeNull();
  });

  it("verify: formato inválido → null sin tocar la DB", async () => {
    for (const bad of ["", "garbage", "sin-punto", `${PID}.corto`, `.${"a".repeat(48)}`, "no-uuid.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]) {
      expect(await verifyMcpToken(bad)).toBeNull();
    }
    expect(await verifyMcpToken(null)).toBeNull();
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it("verify: sin fila guardada → null", async () => {
    maybeSingle.mockResolvedValue({ data: null });
    expect(await verifyMcpToken(`${PID}.${"a".repeat(48)}`)).toBeNull();
  });

  it("rotate: emite uno nuevo y el anterior deja de valer", async () => {
    const viejo = await issueMcpToken(PID);
    const nuevo = await rotateMcpToken(PID);
    expect(nuevo).not.toBe(viejo);
    const hashNuevo = upsert.mock.calls[1][0].config.hash;
    maybeSingle.mockResolvedValue({ data: { config: { hash: hashNuevo } } });
    expect(await verifyMcpToken(nuevo)).toBe(PID);
    expect(await verifyMcpToken(viejo)).toBeNull();
  });

  it("mcpUrl: arma la URL del conector y tolera la barra final", () => {
    expect(mcpUrl("https://app.ar", `${PID}.abc`)).toBe(`https://app.ar/api/mcp/${PID}.abc/mcp`);
    expect(mcpUrl("https://app.ar/", `${PID}.abc`)).toBe(`https://app.ar/api/mcp/${PID}.abc/mcp`);
  });
});
