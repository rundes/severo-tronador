import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => false,
  getSupabase: () => {
    throw new Error("no db");
  },
}));

beforeEach(() => {
  const g = globalThis as unknown as { __audit?: unknown[] };
  if (g.__audit) g.__audit.length = 0;
});

describe("audit (memory path)", () => {
  it("logAudit guarda entry con timestamp", async () => {
    const { logAudit, listAudit } = await import("@/lib/audit");
    await logAudit({
      action: "campaign.create",
      actor: "u@x.com",
      entity_type: "campaign",
      entity_id: "c-1",
      details: { nombre: "T" },
    });
    const list = await listAudit();
    expect(list).toHaveLength(1);
    expect(list[0].actor).toBe("u@x.com");
    expect(list[0].action).toBe("campaign.create");
    expect(list[0].at).toBeTypeOf("string");
  });

  it("listAudit ordena desc por at + cap por limit", async () => {
    const { logAudit, listAudit } = await import("@/lib/audit");
    await logAudit({ action: "flow.create", actor: "a" });
    await new Promise((r) => setTimeout(r, 5));
    await logAudit({ action: "flow.start", actor: "b" });
    await new Promise((r) => setTimeout(r, 5));
    await logAudit({ action: "flow.delete", actor: "c" });
    const list = await listAudit({ limit: 2 });
    expect(list).toHaveLength(2);
    expect(list.map((e) => e.actor)).toEqual(["c", "b"]);
  });

  it("listAudit filtra por action", async () => {
    const { logAudit, listAudit } = await import("@/lib/audit");
    await logAudit({ action: "campaign.create" });
    await logAudit({ action: "flow.create" });
    const list = await listAudit({ action: "flow.create" });
    expect(list).toHaveLength(1);
    expect(list[0].action).toBe("flow.create");
  });

  it("listAudit filtra por actor", async () => {
    const { logAudit, listAudit } = await import("@/lib/audit");
    await logAudit({ action: "campaign.create", actor: "ana@x.com" });
    await logAudit({ action: "campaign.create", actor: "bob@x.com" });
    const list = await listAudit({ actor: "ana@x.com" });
    expect(list).toHaveLength(1);
    expect(list[0].actor).toBe("ana@x.com");
  });

  it("logAudit con campos opcionales vacíos no rompe", async () => {
    const { logAudit, listAudit } = await import("@/lib/audit");
    await logAudit({ action: "campaign.create" });
    const list = await listAudit();
    expect(list[0].actor).toBeNull();
    expect(list[0].entity_id).toBeNull();
    expect(list[0].details).toEqual({});
  });
});
