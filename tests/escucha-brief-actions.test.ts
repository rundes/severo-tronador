import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }));
vi.mock("@/lib/workspace", () => ({
  requireMember: async () => ({ id: "p1", nombre: "P", role: "owner" }),
  requireProject: async () => ({ id: "p1", nombre: "P", role: "owner" }),
  currentUserEmail: async () => "ana@x.ar",
}));
vi.mock("@/lib/db/supabase", () => ({ dbConfigured: () => true, getSupabase: () => ({}) }));

const NOW = "2026-08-25T00:00:00.000Z";
let brief: import("@/lib/client-brief").ClientBrief = {
  entries: [],
  pendingUpdates: [],
  suggestions: [
    { id: "x:nuevo", handle: "nuevo", platform: "x", category: "medio", direccion: "B", razon: "r", suggestedAt: NOW, status: "pending" },
  ],
};
let monitor = { accounts: [], searchesA: [], searchesB: [], calendar: [], noRepetir: [], budget: {}, entidades: {} };
const saveClientBrief = vi.fn(async (_p: string, b: import("@/lib/client-brief").ClientBrief) => { brief = b; });
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

import { resolverActorSugerido, guardarBriefMaestro, resolverBriefUpdate } from "@/app/(dashboard)/escucha/actions";

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

// Las actions terminan en redirect(), que en producción lanza. El mock hace
// lo mismo: capturar el throw es la forma de leer a dónde redirigió.
async function run(fn: () => Promise<void>): Promise<string> {
  try {
    await fn();
    return "";
  } catch (e) {
    return (e as Error).message.replace(/^REDIRECT:/, "");
  }
}

describe("guardarBriefMaestro", () => {
  beforeEach(() => {
    brief = { entries: [], pendingUpdates: [], suggestions: [] };
    saveClientBrief.mockClear();
  });

  it("guarda el maestro con autor y vuelve con maestro=1", async () => {
    const fd = new FormData();
    fd.set("master", "# BRIEF MAESTRO\n\nClub Ferro Carril Oeste.");
    expect(await run(() => guardarBriefMaestro(fd))).toBe("/escucha?tab=escenario&maestro=1");
    expect(brief.master?.text).toBe("# BRIEF MAESTRO\n\nClub Ferro Carril Oeste.");
    expect(brief.master?.by).toBe("ana@x.ar");
  });

  it("texto vacío: no guarda y avisa maestro_vacio", async () => {
    const fd = new FormData();
    fd.set("master", "   \n ");
    expect(await run(() => guardarBriefMaestro(fd))).toBe("/escucha?tab=escenario&brief_error=maestro_vacio");
    expect(saveClientBrief).not.toHaveBeenCalled();
  });

  it("más de 60.000 caracteres: no guarda y avisa", async () => {
    const fd = new FormData();
    fd.set("master", "x".repeat(60001));
    expect(await run(() => guardarBriefMaestro(fd))).toBe("/escucha?tab=escenario&brief_error=too_long");
    expect(saveClientBrief).not.toHaveBeenCalled();
  });
});

describe("resolverBriefUpdate", () => {
  const upd = {
    id: "u1",
    seccion: "3.5",
    texto: "Cuenta nueva @identidadverdolaga (1.2k seguidores)",
    reportAt: "2026-08-26T00:00:00.000Z",
    status: "pending" as const,
  };
  beforeEach(() => {
    brief = { entries: [], pendingUpdates: [upd], suggestions: [] };
    saveClientBrief.mockClear();
  });

  it("aceptar la suma como aporte [informe fecha · §sección] y la marca accepted", async () => {
    const fd = new FormData();
    fd.set("id", "u1");
    fd.set("accion", "aceptar");
    expect(await run(() => resolverBriefUpdate(fd))).toBe("/escucha?tab=escenario&maestro=1");
    expect(brief.entries.map((e) => e.text)).toEqual([
      "[informe 2026-08-26 · §3.5] Cuenta nueva @identidadverdolaga (1.2k seguidores)",
    ]);
    expect(brief.entries[0].by).toBe("ana@x.ar");
    expect(brief.pendingUpdates?.[0].status).toBe("accepted");
  });

  it("descartar no suma aporte y la marca dismissed", async () => {
    const fd = new FormData();
    fd.set("id", "u1");
    fd.set("accion", "descartar");
    await run(() => resolverBriefUpdate(fd));
    expect(brief.entries).toEqual([]);
    expect(brief.pendingUpdates?.[0].status).toBe("dismissed");
  });

  it("aceptar una propuesta ya aceptada: no suma un segundo aporte ni guarda", async () => {
    const fd = new FormData();
    fd.set("id", "u1");
    fd.set("accion", "aceptar");
    await run(() => resolverBriefUpdate(fd));
    expect(brief.entries).toHaveLength(1);
    saveClientBrief.mockClear();
    expect(await run(() => resolverBriefUpdate(fd))).toBe("/escucha?tab=escenario");
    expect(saveClientBrief).not.toHaveBeenCalled();
    expect(brief.entries).toHaveLength(1);
    expect(brief.pendingUpdates?.[0].status).toBe("accepted");
  });

  it("id inexistente: no guarda nada", async () => {
    const fd = new FormData();
    fd.set("id", "nope");
    fd.set("accion", "aceptar");
    expect(await run(() => resolverBriefUpdate(fd))).toBe("/escucha?tab=escenario");
    expect(saveClientBrief).not.toHaveBeenCalled();
  });
});
