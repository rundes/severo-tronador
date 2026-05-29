import { describe, it, expect, beforeEach, vi } from "vitest";

// Fixtures de DB mock.
interface QueryState {
  table: string;
  gtFilter: { col: string; val: string } | null;
}

const fixtures = {
  envios: [] as Array<{
    campaign_id: string;
    estado: string;
    token: string | null;
    created_at: string;
  }>,
  respuestas: [] as Array<{ token: string; created_at: string }>,
  opt_outs: [] as Array<{ dni: string; at: string }>,
  campanas: [] as Array<{
    id: string;
    nombre: string;
    channel: string;
    created_at: string;
  }>,
};

interface Builder {
  select: () => Builder;
  gte: (col: string, val: string) => Builder;
  order: () => Builder;
  limit: () => Builder;
  then: (resolve: (v: unknown) => unknown) => unknown;
}

function makeBuilder(table: string): Builder {
  const state: QueryState = { table, gtFilter: null };
  const builder: Builder = {
    select: () => builder,
    gte(col, val) {
      state.gtFilter = { col, val };
      return builder;
    },
    order: () => builder,
    limit: () => builder,
    then(resolve) {
      const all = (fixtures as Record<string, unknown[]>)[state.table] ?? [];
      let out = all;
      if (state.gtFilter) {
        const f = state.gtFilter;
        out = (all as Record<string, string>[]).filter(
          (r) => (r[f.col] ?? "") >= f.val,
        );
      }
      return resolve({ data: out, error: null });
    },
  };
  return builder;
}

vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => true,
  getSupabase: () => ({
    from: (t: string) => makeBuilder(t),
  }),
}));

// loadContacts → padron mock, no DB
vi.mock("@/lib/segments", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    loadContacts: async () => [
      { contact: { dni: "1" }, rel: { healthScore: 95 }, edad: null },
      { contact: { dni: "2" }, rel: { healthScore: 60 }, edad: null },
      { contact: { dni: "3" }, rel: { healthScore: 20 }, edad: null },
    ],
  };
});

beforeEach(() => {
  fixtures.envios.length = 0;
  fixtures.respuestas.length = 0;
  fixtures.opt_outs.length = 0;
  fixtures.campanas.length = 0;
});

describe("loadDashboard (Plan 03 F1)", () => {
  it("KPIs vacío cuando no hay datos", async () => {
    const { loadDashboard } = await import("@/lib/analytics");
    const d = await loadDashboard(7);
    expect(d.kpis.sent).toBe(0);
    expect(d.kpis.responseRate).toBe(0);
    expect(d.timeSeries).toHaveLength(7);
  });

  it("cuenta envíos por estado", async () => {
    const now = new Date().toISOString();
    fixtures.envios.push(
      { campaign_id: "c1", estado: "sent", token: "t1", created_at: now },
      { campaign_id: "c1", estado: "sent", token: "t2", created_at: now },
      { campaign_id: "c1", estado: "failed", token: null, created_at: now },
      { campaign_id: "c1", estado: "skipped", token: null, created_at: now },
    );
    fixtures.campanas.push({
      id: "c1",
      nombre: "T",
      channel: "email",
      created_at: now,
    });
    const { loadDashboard } = await import("@/lib/analytics");
    const d = await loadDashboard(30);
    expect(d.kpis.sent).toBe(2);
    expect(d.kpis.failed).toBe(1);
    expect(d.kpis.skipped).toBe(1);
  });

  it("calcula response rate por join token", async () => {
    const now = new Date().toISOString();
    fixtures.envios.push(
      { campaign_id: "c1", estado: "sent", token: "t1", created_at: now },
      { campaign_id: "c1", estado: "sent", token: "t2", created_at: now },
      { campaign_id: "c1", estado: "sent", token: "t3", created_at: now },
    );
    fixtures.respuestas.push({ token: "t1", created_at: now });
    fixtures.respuestas.push({ token: "t3", created_at: now });
    fixtures.campanas.push({
      id: "c1",
      nombre: "T",
      channel: "email",
      created_at: now,
    });
    const { loadDashboard } = await import("@/lib/analytics");
    const d = await loadDashboard(30);
    expect(d.kpis.responses).toBe(2);
    expect(d.kpis.responseRate).toBeCloseTo(2 / 3, 5);
  });

  it("opt-out rate sobre sent", async () => {
    const now = new Date().toISOString();
    fixtures.envios.push(
      { campaign_id: "c1", estado: "sent", token: null, created_at: now },
      { campaign_id: "c1", estado: "sent", token: null, created_at: now },
    );
    fixtures.opt_outs.push({ dni: "1", at: now });
    fixtures.campanas.push({
      id: "c1",
      nombre: "T",
      channel: "email",
      created_at: now,
    });
    const { loadDashboard } = await import("@/lib/analytics");
    const d = await loadDashboard(30);
    expect(d.kpis.optOuts).toBe(1);
    expect(d.kpis.optOutRate).toBeCloseTo(0.5, 5);
  });

  it("agrega por canal correctamente", async () => {
    const now = new Date().toISOString();
    fixtures.envios.push(
      { campaign_id: "c-mail", estado: "sent", token: "t1", created_at: now },
      { campaign_id: "c-mail", estado: "sent", token: "t2", created_at: now },
      { campaign_id: "c-sms", estado: "sent", token: "t3", created_at: now },
    );
    fixtures.respuestas.push({ token: "t1", created_at: now });
    fixtures.campanas.push({
      id: "c-mail",
      nombre: "Mail",
      channel: "email",
      created_at: now,
    });
    fixtures.campanas.push({
      id: "c-sms",
      nombre: "Sms",
      channel: "sms",
      created_at: now,
    });
    const { loadDashboard } = await import("@/lib/analytics");
    const d = await loadDashboard(30);
    expect(d.kpis.byChannel.email.sent).toBe(2);
    expect(d.kpis.byChannel.email.responses).toBe(1);
    expect(d.kpis.byChannel.sms.sent).toBe(1);
  });

  it("comparativa campañas devuelve row por campaña", async () => {
    const now = new Date().toISOString();
    fixtures.campanas.push({
      id: "c1",
      nombre: "A",
      channel: "email",
      created_at: now,
    });
    fixtures.campanas.push({
      id: "c2",
      nombre: "B",
      channel: "sms",
      created_at: now,
    });
    fixtures.envios.push(
      { campaign_id: "c1", estado: "sent", token: "t1", created_at: now },
      { campaign_id: "c2", estado: "sent", token: "t2", created_at: now },
    );
    fixtures.respuestas.push({ token: "t1", created_at: now });
    const { loadDashboard } = await import("@/lib/analytics");
    const d = await loadDashboard(30);
    expect(d.campaigns).toHaveLength(2);
    const a = d.campaigns.find((c) => c.nombre === "A")!;
    expect(a.responseRate).toBe(1);
    const b = d.campaigns.find((c) => c.nombre === "B")!;
    expect(b.responseRate).toBe(0);
  });

  it("costo SMS > 0, email = 0 (free tier)", async () => {
    const now = new Date().toISOString();
    fixtures.envios.push(
      { campaign_id: "c1", estado: "sent", token: null, created_at: now },
      { campaign_id: "c1", estado: "sent", token: null, created_at: now },
    );
    fixtures.campanas.push({
      id: "c1",
      nombre: "Sms",
      channel: "sms",
      created_at: now,
    });
    const { loadDashboard } = await import("@/lib/analytics");
    const d = await loadDashboard(30);
    expect(d.kpis.estCostUsd).toBeGreaterThan(0);
    expect(d.kpis.estCostUsd).toBeCloseTo(2 * 0.04, 5);
  });

  it("time-series llena días vacíos con 0", async () => {
    const { loadDashboard } = await import("@/lib/analytics");
    const d = await loadDashboard(7);
    expect(d.timeSeries).toHaveLength(7);
    expect(d.timeSeries.every((p) => p.envios === 0 && p.responses === 0)).toBe(
      true,
    );
  });

  it("health distribution lee del padrón mock", async () => {
    const { loadDashboard } = await import("@/lib/analytics");
    const d = await loadDashboard(7);
    expect(d.health.total).toBe(3);
    expect(d.health.green).toBe(1);
    expect(d.health.yellow).toBe(1);
    expect(d.health.red).toBe(1);
  });
});
