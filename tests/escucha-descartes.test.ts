import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock Supabase mínimo: select().eq()/.eq().maybeSingle() / insert / delete().eq().eq()
type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let forceSelectError = false;

function builder(name: string) {
  const filters: [string, unknown][] = [];
  let op: "select" | "insert" | "delete" = "select";
  let single = false;
  const match = (r: Row) => filters.every(([k, v]) => r[k] === v);
  const api = {
    select() {
      op = "select";
      return api;
    },
    insert(p: Row) {
      tables[name].push(p);
      return Promise.resolve({ error: null });
    },
    delete() {
      op = "delete";
      return api;
    },
    eq(k: string, v: unknown) {
      filters.push([k, v]);
      return api;
    },
    maybeSingle() {
      single = true;
      return resolve();
    },
    then(res: (v: unknown) => unknown) {
      return res(resolveValue());
    },
  };
  function resolveValue() {
    if (op === "delete") {
      tables[name] = tables[name].filter((r) => !match(r));
      return { data: null, error: null };
    }
    if (forceSelectError) return { data: null, error: { message: "relation does not exist" } };
    const matched = tables[name].filter(match);
    return { data: single ? (matched[0] ?? null) : matched, error: null };
  }
  function resolve() {
    return Promise.resolve(resolveValue());
  }
  return api;
}

vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => true,
  getSupabase: () => ({ from: (n: string) => builder(n) }),
}));

import { listDescartes, toggleDescarte } from "@/lib/escucha-descartes";

beforeEach(() => {
  tables = { escucha_descartes: [] };
  forceSelectError = false;
});

describe("listDescartes", () => {
  it("devuelve item_keys del proyecto", async () => {
    tables.escucha_descartes.push({ project_id: "p1", item_key: "k1", payload: {} });
    tables.escucha_descartes.push({ project_id: "p2", item_key: "k2", payload: {} });
    expect(await listDescartes("p1")).toEqual(["k1"]);
  });

  it("resiliente: si la tabla no existe (error) → [] (no rompe el feed)", async () => {
    forceSelectError = true;
    expect(await listDescartes("p1")).toEqual([]);
  });
});

describe("toggleDescarte", () => {
  it("descarta si no existía; restaura si existía (toggle)", async () => {
    const d = { itemKey: "k1", payload: { text: "x" } };
    const r1 = await toggleDescarte("p1", d);
    expect(r1).toMatchObject({ ok: true, descartado: true });
    expect(tables.escucha_descartes).toHaveLength(1);

    const r2 = await toggleDescarte("p1", d);
    expect(r2).toMatchObject({ ok: true, descartado: false });
    expect(tables.escucha_descartes).toHaveLength(0);
  });
});
