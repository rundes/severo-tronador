import { describe, it, expect, beforeEach, vi } from "vitest";

// Memory path tests para createFlow / listFlows / deleteFlow.
// Sin Supabase configurado.

vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => false,
  getSupabase: () => {
    throw new Error("Supabase no configurado");
  },
}));

beforeEach(() => {
  vi.resetModules();
  const g = globalThis as unknown as { __flows?: unknown[] };
  if (g.__flows) g.__flows.length = 0;
});

describe("flows (memory path)", () => {
  it("createFlow asigna position por orden de steps", async () => {
    const { createFlow } = await import("@/lib/flows");
    const flow = await createFlow("p1", {
      nombre: "Test",
      segment_filter: {},
      steps: [
        { delay_days: 0, channel: "email", template_id: "t1", condition_kind: "always", position: 99 },
        { delay_days: 3, channel: "whatsapp", template_id: "t2", condition_kind: "if_no_response_to_prev", position: 99 },
        { delay_days: 7, channel: "sms", template_id: "t3", condition_kind: "if_response_to_prev", position: 99 },
      ],
    });
    expect(flow.steps.map((s) => s.position)).toEqual([0, 1, 2]);
    expect(flow.estado).toBe("draft");
    expect(flow.steps[1].channel).toBe("whatsapp");
  });

  it("listFlows ordena por created_at desc", async () => {
    const { createFlow, listFlows } = await import("@/lib/flows");
    await createFlow("p1", { nombre: "A", segment_filter: {}, steps: [] });
    await new Promise((r) => setTimeout(r, 5));
    await createFlow("p1", { nombre: "B", segment_filter: {}, steps: [] });
    const list = await listFlows("p1");
    expect(list.map((f) => f.nombre)).toEqual(["B", "A"]);
  });

  it("deleteFlow remueve por id", async () => {
    const { createFlow, deleteFlow, getFlow } = await import("@/lib/flows");
    const f = await createFlow("p1", { nombre: "del", segment_filter: {}, steps: [] });
    await deleteFlow("p1", f.id);
    expect(await getFlow("p1", f.id)).toBeUndefined();
  });

  it("startFlow en memory devuelve no_db", async () => {
    const { createFlow, startFlow } = await import("@/lib/flows");
    const f = await createFlow("p1", { nombre: "x", segment_filter: {}, steps: [] });
    const res = await startFlow("p1", f.id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("no_db");
  });

  it("createFlow sin steps queda con steps=[]", async () => {
    const { createFlow } = await import("@/lib/flows");
    const f = await createFlow("p1", { nombre: "empty", segment_filter: {}, steps: [] });
    expect(f.steps).toEqual([]);
  });

  it("createFlow preserva createdBy", async () => {
    const { createFlow } = await import("@/lib/flows");
    const f = await createFlow("p1", {
      nombre: "x",
      segment_filter: {},
      steps: [],
      created_by: "u@x.com",
    });
    expect(f.created_by).toBe("u@x.com");
  });
});
