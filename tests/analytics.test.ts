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
  eq: (col: string, val: unknown) => Builder;
  gte: (col: string, val: string) => Builder;
  order: () => Builder;
  limit: () => Builder;
  then: (resolve: (v: unknown) => unknown) => unknown;
}

function makeBuilder(table: string): Builder {
  const state: QueryState = { table, gtFilter: null };
  const builder: Builder = {
    select: () => builder,
    // project_id scoping: no-op en el mock (mantiene la cadena fluida).
    eq: () => builder,
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

// Réplica en JS del RPC dashboard_stats: el dashboard ya no cuenta filas en el
// proceso (PostgREST las truncaba a 1000 en silencio), así que el mock tiene que
// agregar igual que la función SQL para que los tests midan lo mismo.
interface EncuestaResp {
  token: string | null;
  created_at: string;
}
const encuestaRespuestas: EncuestaResp[] = [];

function dashboardStats(since: string) {
  const respondidos = new Set<string>([
    ...fixtures.respuestas.filter((r) => r.created_at >= since).map((r) => r.token),
    ...encuestaRespuestas
      .filter((r) => r.token && r.created_at >= since)
      .map((r) => r.token as string),
  ]);
  const enVentana = fixtures.envios.filter((e) => e.created_at >= since);
  const byCampaign = new Map<
    string,
    { campaign_id: string; sent: number; failed: number; skipped: number; responses: number }
  >();
  const daily = new Map<string, { day: string; envios: number; responses: number }>();
  for (const e of enVentana) {
    const c = byCampaign.get(e.campaign_id) ?? {
      campaign_id: e.campaign_id,
      sent: 0,
      failed: 0,
      skipped: 0,
      responses: 0,
    };
    const respondido = Boolean(e.token && respondidos.has(e.token));
    if (e.estado === "sent") c.sent++;
    else if (e.estado === "failed") c.failed++;
    else if (e.estado === "skipped") c.skipped++;
    if (respondido) c.responses++;
    byCampaign.set(e.campaign_id, c);

    const day = e.created_at.slice(0, 10);
    const d = daily.get(day) ?? { day, envios: 0, responses: 0 };
    d.envios++;
    if (respondido) d.responses++;
    daily.set(day, d);
  }
  return {
    byCampaign: [...byCampaign.values()],
    daily: [...daily.values()].sort((a, b) => a.day.localeCompare(b.day)),
    optOuts: fixtures.opt_outs.filter((o) => o.at >= since).length,
  };
}

vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => true,
  getSupabase: () => ({
    from: (t: string) => makeBuilder(t),
    rpc: (fn: string, params: Record<string, unknown>) =>
      Promise.resolve(
        fn === "dashboard_stats"
          ? { data: dashboardStats(params.p_since as string), error: null }
          : { data: null, error: { message: `rpc ${fn}?` } },
      ),
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
  encuestaRespuestas.length = 0;
});

describe("loadDashboard (Plan 03 F1)", () => {
  it("KPIs vacío cuando no hay datos", async () => {
    const { loadDashboard } = await import("@/lib/analytics");
    const d = await loadDashboard("p1",7);
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
    const d = await loadDashboard("p1",30);
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
    const d = await loadDashboard("p1",30);
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
    const d = await loadDashboard("p1",30);
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
    const d = await loadDashboard("p1",30);
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
    const d = await loadDashboard("p1",30);
    expect(d.campaigns).toHaveLength(2);
    const a = d.campaigns.find((c) => c.nombre === "A")!;
    expect(a.responseRate).toBe(1);
    const b = d.campaigns.find((c) => c.nombre === "B")!;
    expect(b.responseRate).toBe(0);
  });

  it("campaña SMS histórica no estima costo (canal retirado)", async () => {
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
    const d = await loadDashboard("p1",30);
    // sms retirado de OUTREACH_CHANNELS → sin estimación de costo para el
    // histórico de ese canal (los envíos siguen contando en métricas).
    expect(d.kpis.estCostUsd).toBe(0);
  });

  it("time-series llena días vacíos con 0", async () => {
    const { loadDashboard } = await import("@/lib/analytics");
    const d = await loadDashboard("p1",7);
    expect(d.timeSeries).toHaveLength(7);
    expect(d.timeSeries.every((p) => p.envios === 0 && p.responses === 0)).toBe(
      true,
    );
  });

  it("health distribution lee del padrón mock", async () => {
    const { loadDashboard } = await import("@/lib/analytics");
    const d = await loadDashboard("p1",7);
    expect(d.health.total).toBe(3);
    expect(d.health.green).toBe(1);
    expect(d.health.yellow).toBe(1);
    expect(d.health.red).toBe(1);
  });
});
