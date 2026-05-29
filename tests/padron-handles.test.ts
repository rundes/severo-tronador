import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("padron-handles", () => {
  it("normalizeHandle quita @ y baja a lowercase", async () => {
    const { normalizeHandle } = await import("@/lib/padron-handles");
    expect(normalizeHandle("@VecinaCentro")).toBe("vecinacentro");
    expect(normalizeHandle("  @@MarcosK  ")).toBe("marcosk");
    expect(normalizeHandle("anaperez")).toBe("anaperez");
    expect(normalizeHandle(undefined)).toBe("");
    expect(normalizeHandle("")).toBe("");
  });

  it("getMappedXHandles devuelve [] sin DB", async () => {
    const { getMappedXHandles } = await import("@/lib/padron-handles");
    expect(await getMappedXHandles()).toEqual([]);
  });
});

describe("padron CSV parser respeta x_handle", () => {
  it("acepta x_handle como columna válida", async () => {
    const { parsePadronCsv } = await import("@/lib/db/padron");
    const csv =
      "dni,nombre,x_handle\n12345,Juan,@juancito\n67890,Maria,@maria_q";
    const rows = parsePadronCsv(csv);
    expect(rows.length).toBe(2);
    expect((rows[0] as { x_handle?: string }).x_handle).toBe("@juancito");
    expect((rows[1] as { x_handle?: string }).x_handle).toBe("@maria_q");
  });
});
