import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function setProdAuth() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "x");
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "x");
  vi.stubEnv("NEXTAUTH_SECRET", "x");
}

describe("assertAuthConfiguredInProd", () => {
  it("no lanza en dev aunque falten env vars", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { assertAuthConfiguredInProd } = await import("@/lib/auth-guards");
    expect(() => assertAuthConfiguredInProd()).not.toThrow();
  });

  it("lanza en prod si faltan env vars", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    vi.stubEnv("AUTH_SECRET", "");
    const { assertAuthConfiguredInProd } = await import("@/lib/auth-guards");
    expect(() => assertAuthConfiguredInProd()).toThrow(/AUTH_NOT_CONFIGURED/);
  });

  it("lanza en prod si solo está OAuth pero falta NEXTAUTH_SECRET", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "x");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "x");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    vi.stubEnv("AUTH_SECRET", "");
    const { assertAuthConfiguredInProd } = await import("@/lib/auth-guards");
    expect(() => assertAuthConfiguredInProd()).toThrow(/AUTH_NOT_CONFIGURED/);
  });

  it("no lanza en prod con todas las env vars seteadas", async () => {
    setProdAuth();
    const { assertAuthConfiguredInProd } = await import("@/lib/auth-guards");
    expect(() => assertAuthConfiguredInProd()).not.toThrow();
  });

  it("acepta AUTH_SECRET como alias de NEXTAUTH_SECRET", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "x");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "x");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    vi.stubEnv("AUTH_SECRET", "x");
    const { assertAuthConfiguredInProd } = await import("@/lib/auth-guards");
    expect(() => assertAuthConfiguredInProd()).not.toThrow();
  });
});

describe("assertAllowlistConfiguredInProd", () => {
  it("warning en prod si allowlist vacío", async () => {
    setProdAuth();
    vi.stubEnv("ALLOWED_EMAILS", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { assertAllowlistConfiguredInProd } = await import(
      "@/lib/auth-guards"
    );
    assertAllowlistConfiguredInProd();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/ALLOWED_EMAILS/));
    warn.mockRestore();
  });

  it("sin warning en prod si allowlist tiene emails", async () => {
    setProdAuth();
    vi.stubEnv("ALLOWED_EMAILS", "user@example.com,admin@example.com");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { assertAllowlistConfiguredInProd } = await import(
      "@/lib/auth-guards"
    );
    assertAllowlistConfiguredInProd();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("sin warning en dev aunque allowlist esté vacío", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOWED_EMAILS", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { assertAllowlistConfiguredInProd } = await import(
      "@/lib/auth-guards"
    );
    assertAllowlistConfiguredInProd();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("sin warning si auth no está configurada (no aplica gate de allowlist)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    vi.stubEnv("AUTH_SECRET", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { assertAllowlistConfiguredInProd } = await import(
      "@/lib/auth-guards"
    );
    assertAllowlistConfiguredInProd();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
