import { describe, it, expect, beforeEach } from "vitest";

// revokeOptOut: da de alta de nuevo a un contacto (quita la baja del proyecto).

beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const g = globalThis as unknown as { __memRepos?: Map<string, unknown> };
  g.__memRepos?.delete?.("opt_outs");
});

describe("revokeOptOut (memoria)", () => {
  it("quita la baja y isOptedOut vuelve a false", async () => {
    const { optOut, isOptedOut, revokeOptOut } = await import("@/lib/optout");
    await optOut("proj-1", "30111222", "sms baja");
    expect(await isOptedOut("proj-1", "30111222")).toBe(true);

    const r = await revokeOptOut("proj-1", "30111222");
    expect(r.revoked).toBe(true);
    expect(await isOptedOut("proj-1", "30111222")).toBe(false);
  });

  it("revocar una baja inexistente es no-op", async () => {
    const { revokeOptOut, isOptedOut } = await import("@/lib/optout");
    const r = await revokeOptOut("proj-1", "99999999");
    expect(r.revoked).toBe(false);
    expect(await isOptedOut("proj-1", "99999999")).toBe(false);
  });

  it("no toca la baja del mismo dni en otro proyecto", async () => {
    const { optOut, isOptedOut, revokeOptOut } = await import("@/lib/optout");
    await optOut("proj-1", "30111222");
    await optOut("proj-2", "30111222");
    await revokeOptOut("proj-1", "30111222");
    expect(await isOptedOut("proj-1", "30111222")).toBe(false);
    expect(await isOptedOut("proj-2", "30111222")).toBe(true);
  });
});
