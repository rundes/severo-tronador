import { describe, it, expect, vi, beforeEach } from "vitest";

// Verifica que los crons de escucha iteran TODOS los proyectos activos
// (Fase 3b/4): un trigger → un loop por proyecto.

const listActiveProjects = vi.fn();
const pullAllSources = vi.fn();
const processXHandleQueue = vi.fn();

vi.mock("@/lib/db/supabase", () => ({ dbConfigured: () => true }));
vi.mock("@/lib/projects", () => ({
  listActiveProjects: () => listActiveProjects(),
}));
vi.mock("@/lib/listening-cache", () => ({
  pullAllSources: (pid: string) => pullAllSources(pid),
}));
vi.mock("@/lib/x-timeline", () => ({
  processXHandleQueue: (pid: string) => processXHandleQueue(pid),
}));
vi.mock("@/lib/logger", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s";
  listActiveProjects.mockResolvedValue([{ id: "pA" }, { id: "pB" }]);
});

function req(path: string) {
  return new Request(`https://x${path}`, {
    headers: { authorization: "Bearer s" },
  });
}

describe("cron listening-pull itera proyectos", () => {
  it("llama pullAllSources una vez por proyecto activo", async () => {
    pullAllSources.mockResolvedValue({ bySource: {}, total: 2 });
    const { GET } = await import("@/app/api/cron/listening-pull/route");
    const res = await GET(req("/api/cron/listening-pull"));
    const json = (await res.json()) as { ok: boolean; projects: number; total: number };
    expect(json.ok).toBe(true);
    expect(json.projects).toBe(2);
    expect(json.total).toBe(4); // 2 por proyecto
    expect(pullAllSources.mock.calls.map((c) => c[0]).sort()).toEqual(["pA", "pB"]);
  });
});

describe("cron x-timeline itera proyectos", () => {
  it("llama processXHandleQueue una vez por proyecto activo", async () => {
    processXHandleQueue.mockResolvedValue({
      processed: 1, errors: 0, posts: 3, pending: 0, dropped: 0,
    });
    const { GET } = await import("@/app/api/cron/x-timeline/route");
    const res = await GET(req("/api/cron/x-timeline"));
    const json = (await res.json()) as { ok: boolean; projects: number; posts: number };
    expect(json.ok).toBe(true);
    expect(json.projects).toBe(2);
    expect(json.posts).toBe(6); // 3 por proyecto
    expect(processXHandleQueue.mock.calls.map((c) => c[0]).sort()).toEqual(["pA", "pB"]);
  });
});
