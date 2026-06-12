import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock Supabase mínimo para el endpoint de re-encolado: soporta
// select().eq()...  / update().eq()  / delete().eq().eq().
type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;

function builder(name: string) {
  const filters: [string, unknown][] = [];
  let op: "select" | "update" | "delete" = "select";
  let payload: Row | null = null;
  const match = (r: Row) => filters.every(([k, v]) => r[k] === v);
  const api = {
    select() {
      op = "select";
      return api;
    },
    update(p: Row) {
      op = "update";
      payload = p;
      return api;
    },
    delete() {
      op = "delete";
      return api;
    },
    eq(k: string, v: unknown) {
      filters.push([k, v]);
      return api;
    },
    then(resolve: (v: unknown) => unknown) {
      if (op === "update") {
        for (const r of tables[name]) if (match(r)) Object.assign(r, payload);
        return resolve({ data: null, error: null });
      }
      if (op === "delete") {
        tables[name] = tables[name].filter((r) => !match(r));
        return resolve({ data: null, error: null });
      }
      return resolve({ data: tables[name].filter(match), error: null });
    },
  };
  return api;
}

const supabaseStub = { from: (name: string) => builder(name) };

vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => true,
  getSupabase: () => supabaseStub,
}));

function seed() {
  tables = {
    envio_queue: [
      { id: "a", token: "t-a", status: "failed", connector_id: "resend", last_error: "Resend HTTP 429", campaign_id: "c1", contact: { email: "a@x.com" } },
      { id: "b", token: "t-b", status: "failed", connector_id: "resend", last_error: "Resend HTTP 503", campaign_id: "c1", contact: { email: "b@x.com" } },
      { id: "c", token: "t-c", status: "failed", connector_id: "resend", last_error: "Resend HTTP 422", campaign_id: "c1", contact: { email: "c@x.com" } },
      { id: "d", token: "t-d", status: "done", connector_id: "resend", last_error: null, campaign_id: "c1", contact: { email: "d@x.com" } },
      { id: "e", token: "t-e", status: "failed", connector_id: "resend", last_error: "Contacto sin email", campaign_id: "c1", contact: { email: null, telefono: "555" } },
      { id: "f", token: "t-f", status: "failed", connector_id: "resend", last_error: "Contacto sin email", campaign_id: "c1", contact: { email: "", telefono: null } },
    ],
    envios: [
      { token: "t-a", estado: "failed" },
      { token: "t-b", estado: "failed" },
      { token: "t-c", estado: "failed" },
    ],
  };
}

beforeEach(() => {
  seed();
  vi.unstubAllEnvs();
  vi.stubEnv("SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "x");
});

async function getHandler() {
  const m = await import("@/app/api/cron/requeue-failed/route");
  return m.GET;
}
function makeReq(qs = "", secret?: string): Request {
  const headers: Record<string, string> = {};
  if (secret) headers.authorization = `Bearer ${secret}`;
  return new Request(`http://x/api/cron/requeue-failed${qs}`, { headers });
}

describe("requeue-failed — auth", () => {
  it("403 en prod sin CRON_SECRET", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const GET = await getHandler();
    expect((await GET(makeReq())).status).toBe(403);
  });
});

describe("requeue-failed — dry run (default)", () => {
  it("no muta y reporta counts por last_error + requeueable", async () => {
    const GET = await getHandler();
    const res = await GET(makeReq());
    const json = (await res.json()) as {
      dry: boolean;
      failed_total: number;
      requeueable: number;
      byError: Record<string, number>;
    };
    expect(json.dry).toBe(true);
    expect(json.failed_total).toBe(5); // status=failed&resend (a,b,c,e,f)
    expect(json.requeueable).toBe(2); // 429 + 503 (no 422 ni "sin email")
    expect(json.byError["Resend HTTP 429"]).toBe(1);
    expect(
      (json as unknown as { sinEmail: { total: number; conTelefono: number; emailNull: number; emailVacio: number } })
        .sinEmail,
    ).toEqual({ total: 2, conTelefono: 1, emailNull: 1, emailVacio: 1 });
    // sin mutación: las filas siguen failed
    expect(tables.envio_queue.find((r) => r.id === "a")!.status).toBe("failed");
    expect(tables.envios).toHaveLength(3);
  });
});

describe("requeue-failed — confirm=1", () => {
  it("re-encola solo transitorios y borra sus envios failed", async () => {
    const GET = await getHandler();
    const res = await GET(makeReq("?confirm=1"));
    const json = (await res.json()) as { requeued: number };
    expect(json.requeued).toBe(2);
    // 429 y 503 → pending reset
    for (const id of ["a", "b"]) {
      const r = tables.envio_queue.find((x) => x.id === id)!;
      expect(r.status).toBe("pending");
      expect(r.attempts).toBe(0);
      expect(r.last_error).toBe(null);
    }
    // 422 sigue failed (rechazo permanente)
    expect(tables.envio_queue.find((r) => r.id === "c")!.status).toBe("failed");
    // envios failed de t-a/t-b borrados; t-c (422) permanece
    const tokens = tables.envios.map((e) => e.token);
    expect(tokens).not.toContain("t-a");
    expect(tokens).not.toContain("t-b");
    expect(tokens).toContain("t-c");
  });
});
