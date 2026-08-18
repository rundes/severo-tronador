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
    // optedOutSet: el cron chequea bajas antes de tocar el connector.
    opt_outs: { rows: [], inserted: [], updates: [] },
  };
}

let tables = makeTables();

interface Filters {
  status?: string;
  campaign_id?: string;
  id?: string;
  estado?: string;
  scheduled_at_lte?: string;
  status_in?: string[];
}

function makeBuilder(name: string, op: "select" | "update" | "insert" | "delete") {
  const filters: Filters = {};
  let updatePayload: Row | null = null;
  let upsertRows: Row[] | null = null;
  let countMode: "exact" | null = null;
  let headMode = false;
  const builder = {
    eq(key: string, val: string) {
      (filters as Record<string, string>)[key] = val;
      return builder;
    },
    in(key: string, vals: string[]) {
      if (key === "status") filters.status_in = vals;
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
    // El route registra en `envios` con upsert + ignoreDuplicates para apoyarse
    // en el unique (campaign_id, token). Replicamos esa semántica: las filas
    // que chocan no se insertan y NO vuelven en el select.
    upsert(
      payload: Row | Row[],
      opts?: { onConflict?: string; ignoreDuplicates?: boolean },
    ) {
      const arr = Array.isArray(payload) ? payload : [payload];
      const keys = (opts?.onConflict ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const fresh = arr.filter((row) => {
        if (keys.length === 0 || !opts?.ignoreDuplicates) return true;
        return !tables[name].rows.some((r) => keys.every((k) => r[k] === row[k]));
      });
      tables[name].inserted.push(...fresh);
      tables[name].rows.push(...fresh);
      upsertRows = fresh;
      return builder;
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
      if (upsertRows) {
        return resolve({ data: upsertRows, error: null });
      }
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
      if (k === "status_in") {
        if (!(v as string[]).includes(r["status"] as string)) return false;
        continue;
      }
      if (r[k] !== v) return false;
    }
    return true;
  }
  return builder;
}

// Réplica en JS del RPC claim_envio_queue: toma hasta p_limit filas tomables
// del conector, las marca 'processing' con attempts+1 y las devuelve. Es la
// pieza que evita el doble envío, así que los tests corren contra su semántica
// (claim + mutación) y no contra un simple select.
const CLAIM_STALE_MS = 15 * 60_000;
function claimEnvioQueue(connectorId: string, limit: number): Row[] {
  const nowIso = new Date().toISOString();
  const staleBefore = new Date(Date.now() - CLAIM_STALE_MS).toISOString();
  const claimable = tables.envio_queue.rows
    .filter((r) => {
      if (r.connector_id !== connectorId) return false;
      const sched = r.scheduled_at;
      if (typeof sched === "string" && sched > nowIso) return false;
      if (r.status === "pending") return true;
      return (
        r.status === "processing" &&
        typeof r.claimed_at === "string" &&
        r.claimed_at < staleBefore
      );
    })
    .slice(0, limit);
  for (const r of claimable) {
    r.status = "processing";
    r.attempts = ((r.attempts as number) ?? 0) + 1;
    r.claimed_at = nowIso;
  }
  return claimable.map((r) => ({ ...r }));
}

const supabaseStub = {
  from(name: string) {
    return {
      select: (cols?: string, opts?: { count?: "exact"; head?: boolean }) =>
        makeBuilder(name, "select").select(cols, opts),
      insert: (p: Row | Row[]) => makeBuilder(name, "insert").insert(p),
      upsert: (
        p: Row | Row[],
        o?: { onConflict?: string; ignoreDuplicates?: boolean },
      ) => makeBuilder(name, "insert").upsert(p, o),
      update: (p: Row) => makeBuilder(name, "update").update(p),
    };
  },
  rpc(fn: string, params: Record<string, unknown>) {
    if (fn === "claim_envio_queue") {
      return Promise.resolve({
        data: claimEnvioQueue(
          params.p_connector_id as string,
          params.p_limit as number,
        ),
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: { message: `rpc ${fn}?` } });
  },
};

// Throttle: el route espacia los envíos con sleep() para no pasar el rate
// limit de Resend (2/seg). Mockeado para no dormir de verdad en los tests.
const { sleepSpy } = vi.hoisted(() => ({ sleepSpy: vi.fn() }));
vi.mock("@/lib/sleep", () => ({ sleep: sleepSpy }));

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
    retryable?: boolean;
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
  project_id: "proj-1",
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
  sleepSpy.mockReset();
  sleepSpy.mockResolvedValue(undefined);
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

  it("send ok=false retryable → vuelve a pending con backoff (no failed)", async () => {
    // Un 429/5xx de Resend es transitorio: no debe marcar la fila como failed
    // permanente, sino reintentar con backoff (como una excepción).
    connectorState.sendResult = { ok: false, retryable: true, error: "Resend HTTP 429" };
    tables.envio_queue.rows.push({ ...PENDING_ROW });
    const GET = await getHandler();
    const res = await GET(makeReq());
    const json = (await res.json()) as { failed: number; rescheduled: number };
    expect(json.failed).toBe(0);
    expect(json.rescheduled).toBe(1);
    // No se inserta envío "failed": el envío no ocurrió, quedó diferido.
    expect(tables.envios.inserted).toHaveLength(0);
    const q0 = tables.envio_queue.rows[0] as Record<string, unknown>;
    expect(q0.status).toBe("pending");
    expect(q0.attempts).toBe(1);
    expect(q0.last_error).toBe("Resend HTTP 429");
  });

  it("send ok=false retryable en el último intento → failed permanente", async () => {
    connectorState.sendResult = { ok: false, retryable: true, error: "Resend HTTP 429" };
    tables.envio_queue.rows.push({ ...PENDING_ROW, attempts: 2 });
    const GET = await getHandler();
    await GET(makeReq());
    const q0 = tables.envio_queue.rows[0] as Record<string, unknown>;
    expect(q0.attempts).toBe(3);
    expect(q0.status).toBe("failed");
  });

  it("throttle: espacia con sleep una vez por envío", async () => {
    tables.envio_queue.rows.push({ ...PENDING_ROW, id: "q1" });
    tables.envio_queue.rows.push({
      ...PENDING_ROW,
      id: "q2",
      contact: { dni: "2", nombre: "Bea", apellido: "Ruiz", email: "b@x.com" },
    });
    const GET = await getHandler();
    await GET(makeReq());
    expect(sleepSpy).toHaveBeenCalledTimes(2);
  });

  it("connector desconocido → no se selecciona (drena por conector conocido)", async () => {
    // El cron itera los conectores CONOCIDOS y consulta pending por cada uno.
    // Una fila con connector_id fuera de ese set no se selecciona: no se envía
    // ni se marca failed (queda pending). En prod el connector_id siempre sale
    // del registry, así que este caso no ocurre.
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
    const json = (await res.json()) as { failed: number; done: number };
    expect(json.failed).toBe(0);
    expect(json.done).toBe(0);
    expect(sendCalls).toBe(0);
    const q0 = tables.envio_queue.rows[0] as Record<string, unknown>;
    expect(q0.status).toBe("pending");
  });
});

describe("send-queue cron — opt-out en el despacho", () => {
  it("no envía a un contacto dado de baja después de encolar", async () => {
    // El chequeo al encolar no alcanza: la baja puede llegar entre el encolado
    // y el despacho (o días después, en un flow con steps a futuro).
    let sendCalls = 0;
    connectorState.sendImpl = async () => {
      sendCalls++;
      return { ok: true };
    };
    tables.envio_queue.rows.push({ ...PENDING_ROW });
    tables.opt_outs.rows.push({
      project_id: "proj-1",
      dni: "1",
      at: "2020-06-01T00:00:00Z",
    });

    const GET = await getHandler();
    const res = await GET(makeReq());
    const json = (await res.json()) as {
      done: number;
      skipped_by_opt_out: number;
    };

    expect(sendCalls).toBe(0);
    expect(json.skipped_by_opt_out).toBe(1);
    expect(json.done).toBe(0);
    expect(tables.envios.inserted).toHaveLength(0);
    const q0 = tables.envio_queue.rows[0] as Record<string, unknown>;
    expect(q0.status).toBe("done");
    expect(q0.last_error).toBe("opt_out_skipped");
  });

  it("la baja de un proyecto no frena el envío de otro", async () => {
    let sendCalls = 0;
    connectorState.sendImpl = async () => {
      sendCalls++;
      return { ok: true, providerMessageId: "m" };
    };
    tables.envio_queue.rows.push({ ...PENDING_ROW });
    tables.opt_outs.rows.push({
      project_id: "otro-proyecto",
      dni: "1",
      at: "2020-06-01T00:00:00Z",
    });

    const GET = await getHandler();
    const res = await GET(makeReq());
    const json = (await res.json()) as {
      done: number;
      skipped_by_opt_out: number;
    };

    expect(sendCalls).toBe(1);
    expect(json.skipped_by_opt_out).toBe(0);
    expect(json.done).toBe(1);
  });

  it("lee las bajas una sola vez por proyecto en el tick", async () => {
    // Sin cache serían N queries por batch. Contamos los select a opt_outs.
    tables.envio_queue.rows.push({ ...PENDING_ROW, id: "q1" });
    tables.envio_queue.rows.push({
      ...PENDING_ROW,
      id: "q2",
      contact: { dni: "2", nombre: "Bea", apellido: "Ruiz", email: "b@x.com" },
    });
    let optOutReads = 0;
    const original = supabaseStub.from;
    const spied = { ...supabaseStub, from: (n: string) => {
      if (n === "opt_outs") optOutReads++;
      return original(n);
    } };
    vi.spyOn(supabaseStub, "from").mockImplementation(spied.from);

    const GET = await getHandler();
    await GET(makeReq());
    vi.mocked(supabaseStub.from).mockRestore();

    expect(optOutReads).toBe(1);
  });
});

describe("send-queue cron — sin doble envío", () => {
  it("la fila ya está tomada ('processing') cuando se llama al proveedor", async () => {
    // Es la propiedad que elimina la ventana de doble envío: el estado se
    // escribe ANTES del send, no después. Si se leyera con un select común, la
    // fila seguiría 'pending' durante toda la llamada al proveedor.
    let statusDuranteSend: unknown;
    let attemptsDuranteSend: unknown;
    connectorState.sendImpl = async () => {
      const q0 = tables.envio_queue.rows[0] as Row;
      statusDuranteSend = q0.status;
      attemptsDuranteSend = q0.attempts;
      return { ok: true, providerMessageId: "m" };
    };
    tables.envio_queue.rows.push({ ...PENDING_ROW, attempts: 0 });

    const GET = await getHandler();
    await GET(makeReq());

    expect(statusDuranteSend).toBe("processing");
    expect(attemptsDuranteSend).toBe(1);
  });

  it("una fila tomada por un tick no la vuelve a tomar el siguiente", async () => {
    // El bug: el cron leía `pending` y recién actualizaba DESPUÉS de enviar, así
    // que dos ticks solapados mandaban el mismo mensaje dos veces.
    let sendCalls = 0;
    connectorState.sendImpl = async () => {
      sendCalls++;
      // Simula un tick que muere después del send, antes de cerrar la fila:
      // la fila queda 'processing' y el siguiente tick NO debe reenviarla.
      throw new Error("boom");
    };
    tables.envio_queue.rows.push({ ...PENDING_ROW });

    const GET = await getHandler();
    await GET(makeReq());
    // El catch la dejó pending con backoff a futuro → el siguiente tick no la
    // toma (ni por scheduled_at ni por claim).
    await GET(makeReq());

    expect(sendCalls).toBe(1);
  });

  it("recupera una fila que quedó 'processing' por un proceso muerto", async () => {
    // Sin recuperación, un corte de la función (maxDuration=60) dejaba la fila
    // trabada para siempre.
    tables.envio_queue.rows.push({
      ...PENDING_ROW,
      status: "processing",
      attempts: 1,
      claimed_at: new Date(Date.now() - 60 * 60_000).toISOString(),
    });

    const GET = await getHandler();
    const res = await GET(makeReq());
    const json = (await res.json()) as { done: number };

    expect(json.done).toBe(1);
    expect((tables.envio_queue.rows[0] as Row).status).toBe("done");
  });

  it("no recupera una fila 'processing' recién tomada", async () => {
    let sendCalls = 0;
    connectorState.sendImpl = async () => {
      sendCalls++;
      return { ok: true };
    };
    tables.envio_queue.rows.push({
      ...PENDING_ROW,
      status: "processing",
      attempts: 1,
      claimed_at: new Date().toISOString(),
    });

    const GET = await getHandler();
    await GET(makeReq());

    expect(sendCalls).toBe(0);
  });

  it("si falla el registro en envios, la fila NO vuelve a pending", async () => {
    // El proveedor ya aceptó el mensaje: reprogramar acá lo reenviaría. El
    // rollback lógico del catch era la segunda causa de duplicados.
    tables.envio_queue.rows.push({ ...PENDING_ROW });
    const originalFrom = supabaseStub.from;
    vi.spyOn(supabaseStub, "from").mockImplementation((n: string) => {
      if (n === "envios") {
        return {
          ...originalFrom(n),
          upsert: () => ({
            select: () =>
              Promise.resolve({ data: null, error: { message: "boom db" } }),
          }),
        } as unknown as ReturnType<typeof originalFrom>;
      }
      return originalFrom(n);
    });

    const GET = await getHandler();
    const res = await GET(makeReq());
    vi.mocked(supabaseStub.from).mockRestore();
    const json = (await res.json()) as { done: number; rescheduled: number };

    expect(json.done).toBe(1);
    expect(json.rescheduled).toBe(0);
    const q0 = tables.envio_queue.rows[0] as Row;
    expect(q0.status).toBe("done");
  });

  it("un registro ya existente para (campaign_id, token) no se duplica ni se re-espeja", async () => {
    const { enqueueSheetSync } = await import("@/lib/db/mirror");
    vi.mocked(enqueueSheetSync).mockClear();
    // Registro previo del mismo envío (lo que dejaría un tick anterior).
    tables.envios.rows.push({
      campaign_id: "cmp-1",
      token: "tk1",
      estado: "sent",
    });
    tables.envio_queue.rows.push({ ...PENDING_ROW });

    const GET = await getHandler();
    await GET(makeReq());

    expect(tables.envios.inserted).toHaveLength(0);
    expect(tables.envios.rows).toHaveLength(1);
    expect(enqueueSheetSync).not.toHaveBeenCalled();
  });

  it("reprogramar por cuota devuelve el intento que consumió el claim", async () => {
    connectorState.quota = {
      used: 10,
      limit: 10,
      unit: "messages",
      period: "month",
      resetAt: null,
    };
    tables.envio_queue.rows.push({ ...PENDING_ROW, attempts: 0 });

    const GET = await getHandler();
    await GET(makeReq());

    const q0 = tables.envio_queue.rows[0] as Row;
    expect(q0.status).toBe("pending");
    expect(q0.attempts).toBe(0);
  });
});
