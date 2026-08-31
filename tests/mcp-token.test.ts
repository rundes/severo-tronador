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

import {
  issueAccountMcpToken,
  issueMcpToken,
  verifyMcpScope,
  verifyMcpToken,
  rotateMcpToken,
  mcpUrl,
} from "@/lib/mcp-token";

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

  it("verifyMcpScope: el token de proyecto resuelve alcance proyecto", async () => {
    const token = await issueMcpToken(PID);
    const storedHash = upsert.mock.calls[0][0].config.hash;
    maybeSingle.mockResolvedValue({ data: { config: { hash: storedHash } } });
    expect(await verifyMcpScope(token)).toEqual({ kind: "project", projectId: PID });
  });
});

describe("mcp-token de cuenta (multiproyecto)", () => {
  const EMAIL = "Operador@Estudio.AR";

  beforeEach(() => {
    upsert.mockClear();
    maybeSingle.mockReset();
  });

  it("issue: prefijo acct- derivado del email, email normalizado y default en la fila, plaintext afuera", async () => {
    const token = await issueAccountMcpToken(EMAIL, PID);
    expect(token).toMatch(/^acct-[0-9a-f]{24}\.[0-9a-f]{48}$/);
    const [row, opts] = upsert.mock.calls[0];
    expect(row.connector_id).toBe(`mcp-token:${token.split(".")[0]}`);
    expect(row.project_id).toBeNull();
    expect(opts.onConflict).toBe("connector_id,project_id");
    expect(row.config.email).toBe("operador@estudio.ar");
    expect(row.config.defaultProjectId).toBe(PID);
    expect(JSON.stringify(row.config)).not.toContain(token.split(".")[1]);
    expect(row.config.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("el prefijo es determinístico por email: regenerar PISA la fila y rota el token", async () => {
    const t1 = await issueAccountMcpToken(EMAIL, PID);
    const t2 = await issueAccountMcpToken("  operador@estudio.ar ", null);
    expect(t1.split(".")[0]).toBe(t2.split(".")[0]);
    expect(t1).not.toBe(t2);
    expect(upsert.mock.calls[0][0].connector_id).toBe(upsert.mock.calls[1][0].connector_id);
  });

  it("verifyMcpScope: acepta el token de cuenta recién emitido con email y default", async () => {
    const token = await issueAccountMcpToken(EMAIL, PID);
    const cfg = upsert.mock.calls[0][0].config;
    maybeSingle.mockResolvedValue({ data: { config: cfg } });
    expect(await verifyMcpScope(token)).toEqual({
      kind: "account",
      email: "operador@estudio.ar",
      defaultProjectId: PID,
    });
    expect(await verifyMcpScope(`${token.split(".")[0]}.${"0".repeat(48)}`)).toBeNull();
  });

  it("verifyMcpToken (compat, solo proyecto): el token de cuenta devuelve null", async () => {
    const token = await issueAccountMcpToken(EMAIL, PID);
    const cfg = upsert.mock.calls[0][0].config;
    maybeSingle.mockResolvedValue({ data: { config: cfg } });
    expect(await verifyMcpToken(token)).toBeNull();
  });

  it("fila de cuenta sin email (rota) → null aunque el hash valide", async () => {
    const token = await issueAccountMcpToken(EMAIL, null);
    const cfg = upsert.mock.calls[0][0].config;
    maybeSingle.mockResolvedValue({ data: { config: { hash: cfg.hash } } });
    expect(await verifyMcpScope(token)).toBeNull();
  });

  it("prefijo con formato inválido → null sin tocar la DB", async () => {
    for (const bad of [`acct-corto.${"a".repeat(48)}`, `acct-${"g".repeat(24)}.${"a".repeat(48)}`, `acct-${"a".repeat(24)}.corto`]) {
      expect(await verifyMcpScope(bad)).toBeNull();
    }
    expect(maybeSingle).not.toHaveBeenCalled();
  });
});
