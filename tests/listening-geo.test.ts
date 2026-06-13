import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase: readCachedItems encadena select().eq().gte().order().limit()
// y resuelve con una fila que trae lat/lng. Verificamos que el mapeo las lleva
// al ListenItem (antes se perdían).
const ROW = {
  source: "meta-ig",
  text: "posteo geo",
  url: "https://ig.com/p/1",
  published_at: "2026-06-10T00:00:00Z",
  topic: null,
  author: "alguien",
  kind: "post",
  parent_url: null,
  lat: -32.97,
  lng: -68.84,
  meta: null,
  connector_id: "meta-content-library",
};

function chain() {
  const api: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "order", "limit", "in"]) {
    api[m] = () => api;
  }
  api.then = (resolve: (v: unknown) => unknown) => resolve({ data: [ROW], error: null });
  return api;
}

vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => true,
  getSupabase: () => ({ from: () => chain() }),
}));

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "x");
});

describe("readCachedItems geo", () => {
  it("mapea lat/lng de la fila al ListenItem", async () => {
    const { readCachedItems } = await import("@/lib/listening-cache");
    const items = await readCachedItems("p1");
    expect(items[0].lat).toBe(-32.97);
    expect(items[0].lng).toBe(-68.84);
    expect(items[0].connectorId).toBe("meta-content-library");
  });
});
