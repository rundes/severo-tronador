import { describe, it, expect, beforeEach, vi } from "vitest";

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {
  envios: [],
  respuestas: [],
  opt_outs: [],
  campanas: [],
};

interface Builder {
  select: () => Builder;
  eq: (col: string, val: unknown) => Builder;
  in: (col: string, vals: unknown[]) => Builder;
  order: (col: string, opts?: unknown) => Builder;
  range: (from: number, to: number) => Builder;
  then: (resolve: (v: unknown) => unknown) => unknown;
}

function makeBuilder(name: string): Builder {
  let inFilter: { col: string; vals: unknown[] } | null = null;
  let ranged = false;
  const builder: Builder = {
    select: () => builder,
    // project_id scoping: no-op en el mock (el aislamiento por proyecto se
    // cubre en otros tests); mantiene la cadena fluida.
    eq: () => builder,
    in(col, vals) {
      inFilter = { col, vals };
      return builder;
    },
    order: () => builder,
    range(from) {
      // Solo la primera página trae datos; las siguientes vacías (corta el loop).
      ranged = from > 0;
      return builder;
    },
    then(resolve) {
      if (ranged) return resolve({ data: [], error: null });
      const all = tables[name] ?? [];
      const matched = inFilter
        ? all.filter((r) => inFilter!.vals.includes(r[inFilter!.col]))
        : all;
      return resolve({ data: matched, error: null });
    },
  };
  return builder;
}

const supabaseStub = {
  from(name: string) {
    return makeBuilder(name);
  },
};

vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => true,
  getSupabase: () => supabaseStub,
}));

beforeEach(() => {
  tables.envios.length = 0;
  tables.respuestas.length = 0;
  tables.opt_outs.length = 0;
  tables.campanas.length = 0;
});

async function load(dnis: string[]) {
  const { loadRawRelationships } = await import("@/lib/db/relations");
  return loadRawRelationships("p1", dnis);
}

describe("loadRawRelationships", () => {
  it("vacío si la lista de DNIs es []", async () => {
    const r = await load([]);
    expect(r.size).toBe(0);
  });

  it("DNIs sin envíos/optouts → RawRelationship vacía", async () => {
    const r = await load(["1", "2"]);
    expect(r.get("1")).toEqual({ dni: "1", events: [], optOuts: [] });
    expect(r.get("2")).toEqual({ dni: "2", events: [], optOuts: [] });
  });

  it("envío sent → ContactEvent con channel de la campaña", async () => {
    tables.envios.push({
      campaign_id: "cmp-A",
      dni: "1",
      token: "tok-1",
      created_at: "2026-05-01T00:00:00Z",
      estado: "sent",
    });
    tables.campanas.push({ id: "cmp-A", channel: "email" });
    const r = await load(["1"]);
    expect(r.get("1")?.events).toHaveLength(1);
    expect(r.get("1")?.events[0]).toMatchObject({
      channel: "email",
      contactedAt: "2026-05-01T00:00:00Z",
    });
  });

  it("respuesta con mismo token → respondedAt seteado", async () => {
    tables.envios.push({
      campaign_id: "cmp-A",
      dni: "1",
      token: "tok-1",
      created_at: "2026-05-01T00:00:00Z",
      estado: "sent",
    });
    tables.campanas.push({ id: "cmp-A", channel: "email" });
    tables.respuestas.push({
      token: "tok-1",
      dni: "1",
      created_at: "2026-05-02T00:00:00Z",
    });
    const r = await load(["1"]);
    expect(r.get("1")?.events[0].respondedAt).toBe("2026-05-02T00:00:00Z");
  });

  it("ignora envíos con estado distinto de 'sent'", async () => {
    tables.envios.push({
      campaign_id: "cmp-A",
      dni: "1",
      token: null,
      created_at: "2026-05-01T00:00:00Z",
      estado: "failed",
    });
    tables.envios.push({
      campaign_id: "cmp-A",
      dni: "1",
      token: null,
      created_at: "2026-05-02T00:00:00Z",
      estado: "skipped",
    });
    tables.campanas.push({ id: "cmp-A", channel: "email" });
    const r = await load(["1"]);
    expect(r.get("1")?.events).toHaveLength(0);
  });

  it("opt_out global expande a todos los canales", async () => {
    tables.opt_outs.push({ dni: "1", at: "2026-04-01T00:00:00Z", reason: "x" });
    const r = await load(["1"]);
    const channels = r.get("1")?.optOuts.map((o) => o.channel) ?? [];
    expect(channels).toEqual(
      expect.arrayContaining([
        "email",
        "whatsapp",
        "sms",
        "voice",
        "telegram",
      ]),
    );
    expect(channels).toHaveLength(5);
  });
});
