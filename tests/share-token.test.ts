import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  signShareToken,
  verifyShareToken,
  SHARE_DURATIONS,
} from "@/lib/share-token";

const TEST_KEY = Buffer.from("0".repeat(32), "utf8").toString("base64");
const ORIGINAL_KEY = process.env.CONFIG_MASTER_KEY;

// Set una sola vez al inicio + restore al final. Sin vi.stubEnv para no
// interferir con otros tests del mismo worker que leen env directamente.
beforeAll(() => {
  process.env.CONFIG_MASTER_KEY = TEST_KEY;
});

afterAll(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.CONFIG_MASTER_KEY;
  else process.env.CONFIG_MASTER_KEY = ORIGINAL_KEY;
});

describe("signShareToken + verifyShareToken", () => {
  it("roundtrip campaign token válido", () => {
    const exp = Date.now() + SHARE_DURATIONS.week;
    const token = signShareToken({ t: "campaign", id: "cmp-1", exp });
    const r = verifyShareToken(token);
    expect(r.ok).toBe(true);
    expect(r.payload?.t).toBe("campaign");
    expect(r.payload?.id).toBe("cmp-1");
    expect(r.payload?.exp).toBe(exp);
  });

  it("token expirado → reason expired", () => {
    const exp = Date.now() - 1000;
    const token = signShareToken({ t: "campaign", id: "cmp-2", exp });
    const r = verifyShareToken(token);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("expired");
  });

  it("firma manipulada → bad_signature", () => {
    const token = signShareToken({ t: "campaign", id: "x", exp: Date.now() + 10000 });
    const [payload, sig] = token.split(".");
    // Flip un char de la firma
    const broken = sig.slice(0, -1) + (sig.slice(-1) === "A" ? "B" : "A");
    const r = verifyShareToken(`${payload}.${broken}`);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("bad_signature");
  });

  it("payload manipulado → bad_signature (la firma no matchea)", () => {
    const token = signShareToken({ t: "campaign", id: "good", exp: Date.now() + 10000 });
    const [, sig] = token.split(".");
    const evilPayload = Buffer.from(
      JSON.stringify({ t: "campaign", id: "evil", exp: Date.now() + 10000 }),
      "utf8",
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const r = verifyShareToken(`${evilPayload}.${sig}`);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("bad_signature");
  });

  it("formato inválido → bad_format", () => {
    expect(verifyShareToken("no-dots").reason).toBe("bad_format");
    expect(verifyShareToken("a.b.c").reason).toBe("bad_format");
  });

  it("sin CONFIG_MASTER_KEY → no_key", () => {
    const saved = process.env.CONFIG_MASTER_KEY;
    delete process.env.CONFIG_MASTER_KEY;
    try {
      const r = verifyShareToken("any.token");
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("no_key");
    } finally {
      if (saved !== undefined) process.env.CONFIG_MASTER_KEY = saved;
    }
  });

  it("token dashboard sin id es válido", () => {
    const token = signShareToken({ t: "dashboard", exp: Date.now() + 1000 });
    const r = verifyShareToken(token);
    expect(r.ok).toBe(true);
    expect(r.payload?.t).toBe("dashboard");
    expect(r.payload?.id).toBeUndefined();
  });

  it("base64url no usa + / ni padding =", () => {
    const token = signShareToken({ t: "campaign", id: "x", exp: 1 });
    expect(token).not.toMatch(/[+/=]/);
  });
});
