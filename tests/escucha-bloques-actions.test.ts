import { describe, it, expect, vi, beforeEach } from "vitest";

const redirect = vi.fn((url: string) => { throw new Error(`REDIRECT ${url}`); });
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }));
vi.mock("@/lib/workspace", () => ({
  requireMember: async () => ({ id: "p1", nombre: "P", role: "owner" }),
  requireProject: async () => ({ id: "p1", nombre: "P", role: "owner" }),
  currentUserEmail: async () => "ana@x.ar",
}));
vi.mock("@/lib/db/supabase", () => ({ dbConfigured: () => true, getSupabase: () => ({}) }));
vi.mock("@/lib/listening-cache", () => ({ pullAllSources: vi.fn(async () => ({ total: 0, bySource: {}, errors: [] })), savePullSummary: vi.fn() }));
vi.mock("@/lib/x-timeline", () => ({ enqueueXHandles: vi.fn() }));

const NOW = "2026-08-25T00:00:00.000Z";

const initialCfg: Record<string, unknown> = {
  zona: "Ibicuy", pais: "AR", radioKm: null, lat: null, lng: null, keywords: ["viejo"], fuentes: [], rssFeeds: ["https://m.ar"], xHandles: [], radioStreams: [],
};
let cfg: Record<string, unknown> = { ...initialCfg };
const saveListeningConfig = vi.fn(async (_p: string, c: typeof cfg) => { cfg = c; });
vi.mock("@/lib/listening-config", () => ({
  getListeningConfig: async () => cfg,
  saveListeningConfig: (p: string, c: typeof cfg) => saveListeningConfig(p, c),
}));

const initialMonitor: Record<string, unknown> = { accounts: [], searchesA: [], searchesB: [], calendar: [], noRepetir: ["n"], budget: {}, entidades: {} };
let monitor: Record<string, unknown> = { ...initialMonitor };
const saveMonitorConfig = vi.fn(async (_p: string, m: typeof monitor) => { monitor = m; });
vi.mock("@/lib/monitor-config", async (orig) => ({
  ...(await orig<typeof import("@/lib/monitor-config")>()),
  getMonitorConfig: async () => monitor,
  saveMonitorConfig: (p: string, m: typeof monitor) => saveMonitorConfig(p, m),
}));

const initialBrief: Record<string, unknown> = {
  entries: [], suggestions: [],
  proposal: { at: NOW, briefHash: "h", tipo: "territorial", resumen: "", keywords: [], searchesA: [], searchesB: [], accounts: [], entidades: {}, calendar: [], audio: [], applied: {} },
};
let brief: Record<string, unknown> = { ...initialBrief };
const saveClientBrief = vi.fn(async (_p: string, b: typeof brief) => { brief = b; });
vi.mock("@/lib/client-brief", async (orig) => ({
  ...(await orig<typeof import("@/lib/client-brief")>()),
  getClientBrief: async () => brief,
  saveClientBrief: (p: string, b: typeof brief) => saveClientBrief(p, b),
}));

import { guardarTerritorio, guardarPrensa, guardarRedes, guardarAudio, guardarReglas } from "@/app/(dashboard)/escucha/actions";

const fd = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) (Array.isArray(v) ? v : [v]).forEach((x) => f.append(k, x));
  return f;
};
const run = (p: Promise<unknown>) => p.catch((e: Error) => e.message);

describe("acciones por bloque", () => {
  beforeEach(() => {
    redirect.mockClear();
    saveListeningConfig.mockClear();
    saveClientBrief.mockClear();
    cfg = { ...initialCfg };
    monitor = { ...initialMonitor };
    brief = { ...initialBrief };
  });

  it("guardarTerritorio pisa solo zona/pais/keywords y marca applied.territorio", async () => {
    const r = await run(guardarTerritorio(fd({ zona: "Ibicuy, ER", pais: "ar", keywords: "a\nb", radioKm: "", lat: "", lng: "" })));
    expect(r).toBe("REDIRECT /escucha?tab=escenario&ok=territorio");
    expect(cfg.keywords).toEqual(["a", "b"]);
    expect(cfg.rssFeeds).toEqual(["https://m.ar"]); // intacto
    expect((brief.proposal as { applied: Record<string, string> }).applied.territorio).toBeTruthy();
  });

  it("guardarPrensa pisa medios y toggles, conserva FB/Telegram", async () => {
    cfg = { ...cfg, rssFeeds: ["https://m.ar", "https://www.facebook.com/muni"], fuentes: ["gdelt", "x-api"] };
    const r = await run(guardarPrensa(fd({ rssFeeds: "https://nuevo.ar", fuentesPrensa: ["gdelt"] })));
    expect(r).toBe("REDIRECT /escucha?tab=escenario&ok=prensa");
    expect(cfg.rssFeeds).toEqual(["https://nuevo.ar", "https://www.facebook.com/muni"]);
    expect(cfg.fuentes).toEqual(["x-api", "gdelt"]);
  });

  it("mergeFuentes: con fuentes vacío y todo marcado no materializa la lista", async () => {
    cfg = { ...initialCfg, fuentes: [] };
    await run(guardarPrensa(fd({ rssFeeds: "https://m.ar", fuentesPrensa: ["gdelt", "rss-medios", "meta-content-library"] })));
    expect(cfg.fuentes).toEqual([]);
  });

  it("mergeFuentes: desmarcar uno desde vacío materializa el resto", async () => {
    cfg = { ...initialCfg, fuentes: [] };
    await run(guardarPrensa(fd({ rssFeeds: "https://m.ar", fuentesPrensa: ["rss-medios", "meta-content-library"] })));
    expect((cfg.fuentes as string[]).sort()).toEqual(["meta-content-library", "rss-medios", "x-api"].sort());
  });

  it("guardarRedes: feeds sociales + cuentas del plan, conserva medios, encola X y marca applied.redes", async () => {
    cfg = { ...initialCfg, rssFeeds: ["https://m.ar", "https://www.facebook.com/vieja"] };
    const r = await run(guardarRedes(fd({ fbUrls: "https://www.facebook.com/muni", tgChannels: "@canal", xHandles: "@uno\n@dos", fuentesRedes: ["x-api"], accounts: "muni, facebook, institucional", searchesA: "a", searchesB: "b" })));
    expect(r).toBe("REDIRECT /escucha?tab=escenario&ok=redes");
    expect(cfg.rssFeeds).toContain("https://m.ar");
    expect(cfg.rssFeeds).toContain("https://www.facebook.com/muni");
    expect(cfg.rssFeeds).toContain("https://t.me/canal"); // normalizeTgChannel("@canal")
    expect(cfg.rssFeeds).not.toContain("https://www.facebook.com/vieja");
    expect(cfg.xHandles).toEqual(["uno", "dos"]);
    expect(monitor.accounts).toEqual([{ handle: "muni", platform: "facebook", category: "institucional", vinculo: undefined }]);
    expect(monitor.searchesA).toEqual(["a"]);
    expect((brief.proposal as { applied: Record<string, string> }).applied.redes).toBeTruthy();
  });

  it("guardarAudio rechaza franja inválida sin persistir; acepta franja vacía y no toca fuentes", async () => {
    const bad = JSON.stringify([{ kind: "radio", url: "https://s/x", station: "R", programa: "P", days: [1], start: "10:00", end: "08:00" }]);
    const r1 = await run(guardarAudio(fd({ audioPrograms: bad })));
    expect(r1).toMatch(/error=audio:/);
    expect(saveListeningConfig).not.toHaveBeenCalled();
    const ok = JSON.stringify([{ kind: "kick", url: "https://kick.com/canal", station: "K", programa: "Vivo", days: [], start: "", end: "" }]);
    const r2 = await run(guardarAudio(fd({ audioPrograms: ok })));
    expect(r2).toBe("REDIRECT /escucha?tab=escenario&ok=audio");
    expect((cfg.radioStreams as { kind: string }[])[0].kind).toBe("kick");
    expect(cfg.fuentes).toEqual(initialCfg.fuentes);
    expect((brief.proposal as { applied: Record<string, string> }).applied.audio).toBeTruthy();
  });

  it("guardarReglas pisa entidades/calendario/noRepetir y marca applied.reglas", async () => {
    const r = await run(guardarReglas(fd({ entidades: "Ibicuy: localidad", calendar: "Fiesta, 2026-09-14", noRepetir: "x" })));
    expect(r).toBe("REDIRECT /escucha?tab=escenario&ok=reglas");
    expect(monitor.entidades).toEqual({ Ibicuy: "localidad" });
    expect(monitor.calendar).toEqual([{ label: "Fiesta", date: "2026-09-14" }]);
    expect((brief.proposal as { applied: Record<string, string> }).applied.reglas).toBeTruthy();
  });
});
