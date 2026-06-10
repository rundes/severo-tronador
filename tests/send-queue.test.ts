import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ──────────────────────────────────────────────────────────────────────────
// Supabase fluent mock: para cada llamada from(table) registramos una "tabla"
// con datos + un builder encadenable (select / eq / update / insert / etc).
// Pensado para los paths del cron, no es un mock general.
// ──────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
interface MockTable {
  rows: Row[];
  inserted: Row[];
  updates: Row[];
}

function makeTables(): Record<string, MockTable> {
  return {
    envio_queue: { rows: [], inserted: [], updates: [] },
    envios: { rows: [], inserted: [], updates: [] },
    campanas: { rows: [], inserted: [], updates: [] },
    sheets_sync_queue: { rows: [], inserted: [], updates: [] },
    // getOrgUsage (guard org-wide) consulta cuotas; vacío → orgUsed 0.
    cuotas: { rows: [], inserted: [], updates: [] },
  };
}

let tables = makeTables();

interface Filters {
  status?: string;
  campaign_id?: string;
  id?: string;
  estado?: string;
  scheduled_at_lte?: string;
}

function makeBuilder(name: string, op: "select" | "update" | "insert" | "delete") {
  const filters: Filters = {};
  let updatePayload: Row | null = null;
  let countMode: "exact" | null = null;
  let headMode = false;
  const builder = {
    eq(key: string, val: string) {
      (filters as Record<string, string>)[key] = val;
      return builder;
    },
    lte(key: string, val: string) {
      if (key === "scheduled_at") filters.scheduled_at_lte = val;
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return builder;
    },
    select(_cols?: string, opts?: { count?: "exact"; head?: boolean }) {
      if (opts?.count === "exact") countMode = "exact";
      if (opts?.head) headMode = true;
      return builder;
    },
    insert(payload: Row | Row[]) {
      const arr = Array.isArray(payload) ? payload : [payload];
      tables[name].inserted.push(...arr);
      tables[name].rows.push(...arr);
      return Promise.resolve({ data: arr, error: null });
    },
    update(payload: Row) {
      updatePayload = payload;
      return builder;
    },
    maybeSingle() {
      const matched = tables[name].rows.find(matchRow);
      return Promise.resolve({ data: matched ?? null, error: null });
    },
    then(resolve: (v: unknown) => unknown) {
      // Terminal: ejecuta según operación.
      if (op === "update" && updatePayload) {
        for (const r of tables[name].rows) {
          if (matchRow(r)) Object.assign(r, updatePayload);
        }
        tables[name].updates.push({ ...filters, ...updatePayload });
        return resolve({ data: null, error: null });
      }
      const matched = tables[name].rows.filter(matchRow);
      if (countMode === "exact" && headMode) {
        return resolve({ count: matched.length, data: null, error: null });
      }
      return resolve({ data: matched, error: null });
    },
  };
  function matchRow(r: Row): boolean {
    for (const [k, v] of Object.entries(filters)) {
      if (k === "scheduled_at_lte") {
        const rv = r["scheduled_at"];
        if (typeof rv === "string" && rv > (v as string)) return false;
        continue;
      }
      if (r[k] !== v) return false;
    }
    return true;
  }
  return builder;
}

const supabaseStub = {
  from(name: string) {
    return {
      select: (cols?: string, opts?: { count?: "exact"; head?: boolean }) =>
        makeBuilder(name, "select").select(cols, opts),
      insert: (p: Row | Row[]) => makeBuilder(name, "insert").insert(p),
      update: (p: Row) => makeBuilder(name, "update").update(p),
    };
  },
};

vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => true,
  getSupabase: () => supabaseStub,
}));
vi.mock("@/lib/db/mirror", () => ({
  enqueueSheetSync: vi.fn().mockResolvedValue(undefined),
}));

// Connector stub controlable por test.
const connectorState = {
  quota: { used: 0, limit: 1000, unit: "messages", period: "month", resetAt: null },
  sendResult: { ok: true, providerMessageId: "msg-1" } as {
    ok: boolean;
    providerMessageId?: string;
    error?: string;
  },
  sendImpl: undefined as
    | ((msg: unknown, c: unknown) => Promise<unknown>)
    | undefined,
};
vi.mock("@/lib/campaigns", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    // El route resuelve el conector por connector_id (soporta 2 proveedores de
    // email). El stub responde solo para "resend"; otros ids → undefined.
    outreachConnectorById: (id: string) =>
      id === "resend"
        ? {
            id: "resend",
            getQuota: async () => connectorState.quota,
            send: connectorState.sendImpl
              ? connectorState.sendImpl
              : async () => connectorState.sendResult,
          }
        : undefined,
  };
});

const PENDING_ROW = {
  id: "q1",
  campaign_id: "cmp-1",
  channel: "email",
  connector_id: "resend",
  contact: { dni: "1", nombre: "Ana", apellido: "Diaz", email: "a@x.com" },
  template: { subject: "S", body: "B" },
  token: "tk1",
  status: "pending",
  attempts: 0,
  scheduled_at: "2020-01-01T00:00:00Z",
};

beforeEach(() => {
  tables = makeTables();
  connectorState.quota = {
    used: 0,
    limit: 1000,
    unit: "messages",
    period: "month",
    resetAt: null,
  };
  connectorState.sendResult = { ok: true, providerMessageId: "msg-1" };
  connectorState.sendImpl = undefined;
  vi.unstubAllEnvs();
  vi.stubEnv("SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "x");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function getHandler() {
  const m = await import("@/app/api/cron/send-queue/route");
  return m.GET;
}

function makeReq(secret?: string): Request {
  const headers: Record<string, string> = {};
  if (secret) headers.authorization = `Bearer ${secret}`;
  return new Request("http://x/api/cron/send-queue", { headers });
}

describe("send-queue cron — auth", () => {
  it("403 en prod sin CRON_SECRET configurado", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const GET = await getHandler();
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
  });

  it("403 si CRON_SECRET está configurado y el header no matchea", async () => {
    vi.stubEnv("CRON_SECRET", "good");
    const GET = await getHandler();
    const res = await GET(makeReq("bad"));
    expect(res.status).toBe(403);
  });

  it("200 si CRON_SECRET matchea", async () => {
    vi.stubEnv("CRON_SECRET", "good");
    const GET = await getHandler();
    const res = await GET(makeReq("good"));
    expect(res.status).toBe(200);
  });
});

describe("send-queue cron — procesamiento", () => {
  it("happy path: connector.send ok → fila envios insertada + queue done", async () => {
    tables.envio_queue.rows.push({ ...PENDING_ROW });
    tables.campanas.rows.push({
      id: "cmp-1",
      metrics: { total: 1, sent: 0, failed: 0, skipped: 0, enqueued: 1 },
      estado: "encolada",
    });
    const GET = await getHandler();
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { done: number; failed: number };
    expect(json.done).toBe(1);
    expect(json.failed).toBe(0);
    expect(tables.envios.inserted).toHaveLength(1);
    expect(tables.envios.inserted[0].estado).toBe("sent");
    expect(tables.envios.inserted[0].provider_message_id).toBe("msg-1");
    const q0 = tables.envio_queue.rows[0] as Record<string, unknown>;
    expect(q0.status).toBe("done");
  });

  it("quota llena → reschedule, no llama send", async () => {
    connectorState.quota.used = 1000;
    let sendCalls = 0;
    connectorState.sendImpl = async () => {
      sendCalls++;
      return { ok: true };
    };
    tables.envio_queue.rows.push({ ...PENDING_ROW });
    const GET = await getHandler();
    const res = await GET(makeReq());
    const json = (await res.json()) as { rescheduled: number; done: number };
    expect(json.rescheduled).toBe(1);
    expect(json.done).toBe(0);
    expect(sendCalls).toBe(0);
    const q0 = tables.envio_queue.rows[0] as Record<string, unknown>;
    expect(q0.last_error).toBe("quota_blocked");
    expect(q0.status).toBe("pending");
  });

  it("connector throw → attempts++ y vuelve a pending con backoff", async () => {
    connectorState.sendImpl = async () => {
      throw new Error("network down");
    };
    tables.envio_queue.rows.push({ ...PENDING_ROW });
    const GET = await getHandler();
    await GET(makeReq());
    const q0 = tables.envio_queue.rows[0] as Record<string, unknown>;
    expect(q0.attempts).toBe(1);
    expect(q0.status).toBe("pending");
    expect(q0.last_error).toBe("network down");
  });

  it("3 errores consecutivos → status failed permanente", async () => {
    connectorState.sendImpl = async () => {
      throw new Error("boom");
    };
    tables.envio_queue.rows.push({ ...PENDING_ROW, attempts: 2 });
    const GET = await getHandler();
    await GET(makeReq());
    const q0 = tables.envio_queue.rows[0] as Record<string, unknown>;
    expect(q0.attempts).toBe(3);
    expect(q0.status).toBe("failed");
    expect(q0.processed_at).toBeTruthy();
  });

  it("send result ok=false → envios fila failed + queue failed", async () => {
    connectorState.sendResult = { ok: false, error: "rejected" };
    tables.envio_queue.rows.push({ ...PENDING_ROW });
    const GET = await getHandler();
    const res = await GET(makeReq());
    const json = (await res.json()) as { failed: number };
    expect(json.failed).toBe(1);
    expect(tables.envios.inserted[0].estado).toBe("failed");
    expect(tables.envios.inserted[0].reason).toBe("rejected");
    const q0 = tables.envio_queue.rows[0] as Record<string, unknown>;
    expect(q0.status).toBe("failed");
  });

  it("connector_id mismatch → queue row failed sin llamar send", async () => {
    let sendCalls = 0;
    connectorState.sendImpl = async () => {
      sendCalls++;
      return { ok: true };
    };
    tables.envio_queue.rows.push({
      ...PENDING_ROW,
      connector_id: "otro-connector",
    });
    const GET = await getHandler();
    const res = await GET(makeReq());
    const json = (await res.json()) as { failed: number };
    expect(json.failed).toBe(1);
    expect(sendCalls).toBe(0);
    const q0 = tables.envio_queue.rows[0] as Record<string, unknown>;
    expect(q0.status).toBe("failed");
    expect(String(q0.last_error)).toMatch(/no registrado/);
  });
});
