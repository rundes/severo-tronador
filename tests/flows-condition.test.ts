import { describe, it, expect, beforeEach, vi } from "vitest";

// shouldDispatch test con mock de Supabase. Aislado del path memory.

interface Row {
  token: string;
  status?: string;
  flow_id?: string;
  flow_step_position?: number;
  contact?: { dni: string };
}

const supaState = {
  queueRows: [] as Row[],
  respuestaTokens: new Set<string>(),
};

interface Builder {
  select: () => Builder;
  eq: (col: string, val: unknown) => Builder;
  in: (col: string, vals: unknown[]) => Builder;
  lt: (col: string, val: number) => Builder;
  then: (resolve: (v: unknown) => unknown) => unknown;
}

function makeBuilder(table: string): Builder {
  const filters: Record<string, unknown> = {};
  let inFilter: { col: string; vals: unknown[] } | null = null;
  let ltFilter: { col: string; val: number } | null = null;
  const builder: Builder = {
    select: () => builder,
    eq(col, val) {
      filters[col] = val;
      return builder;
    },
    in(col, vals) {
      inFilter = { col, vals };
      return builder;
    },
    lt(col, val) {
      ltFilter = { col, val };
      return builder;
    },
    then(resolve) {
      if (table === "envio_queue") {
        const all = supaState.queueRows.filter((r) => {
          if (filters.flow_id && r.flow_id !== filters.flow_id) return false;
          if (
            filters["contact->>dni"] &&
            r.contact?.dni !== filters["contact->>dni"]
          )
            return false;
          if (
            ltFilter?.col === "flow_step_position" &&
            (r.flow_step_position ?? 0) >= ltFilter.val
          )
            return false;
          return true;
        });
        return resolve({ data: all, error: null });
      }
      if (table === "respuestas") {
        const out: { token: string }[] = [];
        if (inFilter?.col === "token") {
          for (const tok of inFilter.vals as string[]) {
            if (supaState.respuestaTokens.has(tok)) out.push({ token: tok });
          }
        }
        return resolve({ data: out, error: null });
      }
      return resolve({ data: [], error: null });
    },
  };
  return builder;
}

const supabaseStub = {
  from(t: string) {
    return makeBuilder(t);
  },
};

vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => true,
  getSupabase: () => supabaseStub,
}));

beforeEach(() => {
  supaState.queueRows = [];
  supaState.respuestaTokens.clear();
});

describe("shouldDispatch (Plan 02 F3)", () => {
  it("always → true sin DB hit", async () => {
    const { shouldDispatch } = await import("@/lib/flows");
    const r = await shouldDispatch({
      flow_id: "f1",
      contact_dni: "1",
      step_position: 1,
      condition_kind: "always",
    });
    expect(r).toBe(true);
  });

  it("sin pasos previos done → conditional skip", async () => {
    const { shouldDispatch } = await import("@/lib/flows");
    const r = await shouldDispatch({
      flow_id: "f1",
      contact_dni: "1",
      step_position: 1,
      condition_kind: "if_no_response_to_prev",
    });
    expect(r).toBe(false);
  });

  it("if_no_response_to_prev → true si no hay respuesta a tokens previos", async () => {
    supaState.queueRows.push({
      token: "tok0",
      status: "done",
      flow_id: "f1",
      flow_step_position: 0,
      contact: { dni: "1" },
    });
    const { shouldDispatch } = await import("@/lib/flows");
    const r = await shouldDispatch({
      flow_id: "f1",
      contact_dni: "1",
      step_position: 1,
      condition_kind: "if_no_response_to_prev",
    });
    expect(r).toBe(true);
  });

  it("if_no_response_to_prev → false si SÍ hay respuesta", async () => {
    supaState.queueRows.push({
      token: "tok0",
      status: "done",
      flow_id: "f1",
      flow_step_position: 0,
      contact: { dni: "1" },
    });
    supaState.respuestaTokens.add("tok0");
    const { shouldDispatch } = await import("@/lib/flows");
    const r = await shouldDispatch({
      flow_id: "f1",
      contact_dni: "1",
      step_position: 1,
      condition_kind: "if_no_response_to_prev",
    });
    expect(r).toBe(false);
  });

  it("if_response_to_prev → true si hay respuesta previa", async () => {
    supaState.queueRows.push({
      token: "tok0",
      status: "done",
      flow_id: "f1",
      flow_step_position: 0,
      contact: { dni: "1" },
    });
    supaState.respuestaTokens.add("tok0");
    const { shouldDispatch } = await import("@/lib/flows");
    const r = await shouldDispatch({
      flow_id: "f1",
      contact_dni: "1",
      step_position: 1,
      condition_kind: "if_response_to_prev",
    });
    expect(r).toBe(true);
  });

  it("if_response_to_prev → false si no hay respuesta", async () => {
    supaState.queueRows.push({
      token: "tok0",
      status: "done",
      flow_id: "f1",
      flow_step_position: 0,
      contact: { dni: "1" },
    });
    const { shouldDispatch } = await import("@/lib/flows");
    const r = await shouldDispatch({
      flow_id: "f1",
      contact_dni: "1",
      step_position: 1,
      condition_kind: "if_response_to_prev",
    });
    expect(r).toBe(false);
  });

  it("ignora steps no-done en la búsqueda de respuestas previas", async () => {
    supaState.queueRows.push({
      token: "tok-pending",
      status: "pending",
      flow_id: "f1",
      flow_step_position: 0,
      contact: { dni: "1" },
    });
    supaState.respuestaTokens.add("tok-pending");
    const { shouldDispatch } = await import("@/lib/flows");
    const r = await shouldDispatch({
      flow_id: "f1",
      contact_dni: "1",
      step_position: 1,
      condition_kind: "if_response_to_prev",
    });
    expect(r).toBe(false);
  });
});
