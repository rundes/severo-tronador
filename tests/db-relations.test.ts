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
  gte: (col: string, val: string) => Builder;
  in: (col: string, vals: unknown[]) => Builder;
  order: (col: string, opts?: unknown) => Builder;
  range: (from: number, to: number) => Builder;
  then: (resolve: (v: unknown) => unknown) => unknown;
}

function makeBuilder(name: string): Builder {
  let inFilter: { col: string; vals: unknown[] } | null = null;
  let sinceFilter: { col: string; val: string } | null = null;
  let ranged = false;
  const builder: Builder = {
    select: () => builder,
    // project_id scoping: no-op en el mock (el aislamiento por proyecto se
    // cubre en otros tests); mantiene la cadena fluida.
    eq: () => builder,
    // Ventana de 180 días sobre envios/respuestas (las bajas no se ventanean).
    gte(col, val) {
      sinceFilter = { col, val };
      return builder;
    },
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
      let matched = inFilter
        ? all.filter((r) => inFilter!.vals.includes(r[inFilter!.col]))
        : all;
      if (sinceFilter) {
        const f = sinceFilter;
        matched = matched.filter((r) => String(r[f.col] ?? "") >= f.val);
      }
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

describe("loadRawRelationships · ventana temporal", () => {
  it("ignora actividad más vieja que la ventana", async () => {
    // Antes se paginaba TODO el historial del proyecto en cada request: el
    // costo crecía para siempre sin cambiar el resultado (la ficha mide
    // actividad reciente).
    const viejo = new Date(Date.now() - 400 * 86400_000).toISOString();
    const reciente = new Date(Date.now() - 10 * 86400_000).toISOString();
    tables.campanas.push({ id: "c1", channel: "email" });
    tables.envios.push({
      campaign_id: "c1", dni: "1", token: "t-viejo",
      created_at: viejo, estado: "sent",
    });
    tables.envios.push({
      campaign_id: "c1", dni: "1", token: "t-nuevo",
      created_at: reciente, estado: "sent",
    });

    const map = await load(["1"]);
    const events = map.get("1")!.events;
    expect(events).toHaveLength(1);
    expect(events[0].contactedAt).toBe(reciente);
  });

  it("las bajas NO se ventanean: son para siempre", async () => {
    const hace2anios = new Date(Date.now() - 730 * 86400_000).toISOString();
    tables.opt_outs.push({ dni: "1", at: hace2anios, reason: "baja" });

    const map = await load(["1"]);
    expect(map.get("1")!.optOuts.length).toBeGreaterThan(0);
  });
});

