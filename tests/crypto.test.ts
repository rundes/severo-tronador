import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.CONFIG_MASTER_KEY = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
});

describe("crypto", () => {
  it("encrypt→decrypt round-trip", async () => {
    const { encryptJson, decryptJson } = await import("@/lib/crypto");
    const obj = { token: "secreto", n: 1 };
    const enc = await encryptJson(obj);
    expect(typeof enc).toBe("string");
    expect(enc).not.toContain("secreto");
    expect(await decryptJson(enc)).toEqual(obj);
  });
});
