import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }));
vi.mock("@/lib/workspace", () => ({
  requireMember: async () => ({ id: "p1", nombre: "P", role: "owner" }),
  requireProject: async () => ({ id: "p1", nombre: "P", role: "owner" }),
  currentUserEmail: async () => "ana@x.ar",
}));
vi.mock("@/lib/db/supabase", () => ({ dbConfigured: () => true, getSupabase: () => ({}) }));

const NOW = "2026-08-25T00:00:00.000Z";
let brief = {
  entries: [],
  suggestions: [
    { id: "x:nuevo", handle: "nuevo", platform: "x", category: "medio", direccion: "B", razon: "r", suggestedAt: NOW, status: "pending" },
  ],
};
let monitor = { accounts: [], searchesA: [], searchesB: [], calendar: [], noRepetir: [], budget: {}, entidades: {} };
const saveClientBrief = vi.fn(async (_p: string, b: typeof brief) => { brief = b; });
const saveMonitorConfig = vi.fn(async (_p: string, m: typeof monitor) => { monitor = m; });
vi.mock("@/lib/client-brief", async (orig) => ({
  ...(await orig<typeof import("@/lib/client-brief")>()),
  getClientBrief: async () => brief,
  saveClientBrief: (p: string, b: typeof brief) => saveClientBrief(p, b),
}));
vi.mock("@/lib/monitor-config", async (orig) => ({
  ...(await orig<typeof import("@/lib/monitor-config")>()),
  getMonitorConfig: async () => monitor,
  saveMonitorConfig: (p: string, m: typeof monitor) => saveMonitorConfig(p, m),
}));

import { resolverActorSugerido } from "@/app/(dashboard)/escucha/actions";

describe("resolverActorSugerido", () => {
  beforeEach(() => { saveClientBrief.mockClear(); saveMonitorConfig.mockClear(); });

  it("incorporar: agrega la cuenta al plan con nota y marca accepted", async () => {
    await resolverActorSugerido({ id: "x:nuevo", accepted: true });
    expect(monitor.accounts).toEqual([
      { handle: "nuevo", platform: "x", category: "medio", nota: "sugerido por barrida 2026-08-25" },
    ]);
    expect(brief.suggestions[0].status).toBe("accepted");
  });

  it("descartar: no toca el plan y marca dismissed", async () => {
    brief = { ...brief, suggestions: [{ ...brief.suggestions[0], status: "pending" }] };
    monitor = { ...monitor, accounts: [] };
    await resolverActorSugerido({ id: "x:nuevo", accepted: false });
    expect(saveMonitorConfig).not.toHaveBeenCalled();
    expect(brief.suggestions[0].status).toBe("dismissed");
  });
});
