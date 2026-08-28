import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";

vi.mock("@/lib/projects", () => ({
  getProject: async () => ({ id: "p1", nombre: "Ferro", slug: "ferro", created_by: null, archived_at: null, created_at: "" }),
}));
vi.mock("@/lib/listening-config", () => ({
  getListeningConfig: async () => ({ zona: "Caballito", pais: "AR", keywords: ["ferro", "elecciones"] }),
}));
const monitor = {
  accounts: [
    { handle: "somosferro2026", platform: "instagram", category: "organizacion" },
    { handle: "ferroweb", platform: "instagram", category: "medio", vinculo: "independiente" },
  ],
  searchesA: [],
  searchesB: [],
  calendar: [{ label: "Elección", date: "2999-01-01" }],
  noRepetir: [],
  budget: {},
  entidades: {},
};
vi.mock("@/lib/monitor-config", async (orig) => ({
  ...(await orig<typeof import("@/lib/monitor-config")>()),
  getMonitorConfig: async () => monitor,
}));

const reports = {
  latest: {
    at: "2026-08-26T15:00:00.000Z",
    markdown: "# Tesis del 26\n\nBajada.\n\n## 01 El escenario\n\nTexto.",
    items24h: 12,
    items7d: 40,
    origen: "claude-chrome" as const,
    titulo: "Tesis del 26",
  },
  history: [
    { at: "2026-08-25T15:00:00.000Z", markdown: "# Tesis del 25\n\nB.", items24h: 8, items7d: 30 },
  ],
};
vi.mock("@/lib/daily-report", async (orig) => ({
  ...(await orig<typeof import("@/lib/daily-report")>()),
  readDailyReports: async () => reports,
}));

vi.mock("@/lib/monitor-metrics", () => ({
  accountMetrics: async () => [
    {
      handle: "somosferro2026",
      category: "organizacion",
      followers: 1200,
      amplificacion: 0.5,
      adhesion: 0.05,
      densidad: 0.5,
      comentarios: 23,
      comentaristas: 19,
      muestraComentarios: [{ autor: "c1", text: "groso" }],
      piezas: 3,
      ultimaActividad: "2026-08-26T12:00:00.000Z",
      historiasVivas: 2,
      ultimaPieza: { text: "Caballito te saluda", likeCount: 600, at: "2026-08-26T12:00:00.000Z" },
    },
  ],
}));

const cached = [
  { source: "instagram/extension", text: "propuesta de salud mental", url: "https://ig/1", author: "ferroenaccion", publishedAt: "2026-08-26T14:00:00.000Z", meta: { likeCount: 3, commentCount: 23 } },
  { source: "x/extension", text: "perdieron las elecciones hoy", url: "https://x/2", author: "DeSocios", publishedAt: "2026-08-20T14:00:00.000Z" },
];
vi.mock("@/lib/listening-cache", () => ({ readCachedItems: async () => cached }));

vi.mock("@/lib/extension-run", () => ({
  readExtensionRun: async () => ({ at: "2026-08-26T13:00:00.000Z", cuentas: 6, busquedas: 4, items: 120, candidatos: 9, sugeridos: 2, errores: [{ platform: "instagram", step: "perfil", detail: "400" }] }),
}));

let brief: import("@/lib/client-brief").ClientBrief = {
  entries: [{ id: "e1", at: "2026-08-20T00:00:00.000Z", by: "ana@x.ar", text: "Aporte del operador." }],
  master: { text: "# BRIEF MAESTRO\n\nClub Ferro.", updatedAt: "2026-08-20T00:00:00.000Z", by: "ana@x.ar" },
  pendingUpdates: [],
  suggestions: [],
};
const saveClientBrief = vi.fn(async (_p: string, b: typeof brief) => { brief = b; });
vi.mock("@/lib/client-brief", async (orig) => ({
  ...(await orig<typeof import("@/lib/client-brief")>()),
  getClientBrief: async () => brief,
  saveClientBrief: (p: string, b: typeof brief) => saveClientBrief(p, b),
}));

let link: import("@/lib/claude-link").ClaudeLink = { conversationUrl: "https://claude.ai/chat/x" };
const saveClaudeLink = vi.fn(async (_p: string, l: typeof link) => { link = l; });
vi.mock("@/lib/claude-link", async (orig) => ({
  ...(await orig<typeof import("@/lib/claude-link")>()),
  readClaudeLink: async () => link,
  saveClaudeLink: (p: string, l: typeof link) => saveClaudeLink(p, l),
}));

const importReport = vi.fn(async () => ({ at: "2026-08-26T15:30:00.000Z", titulo: "Tesis", secciones: 4, briefUpdates: 1, mailSent: true }));
vi.mock("@/lib/report-import", () => ({ importReport: (...a: unknown[]) => importReport(...(a as [])) }));

import { makeTools, TOOL_NAMES, type ToolName } from "@/lib/mcp/tools";

const tools = makeTools("p1");
const byName = new Map(tools.map((t) => [t.name, t]));
const run = (name: ToolName, args: Record<string, unknown> = {}) => byName.get(name)!.handler(args);

describe("makeTools", () => {
  // Las ventanas horarias de get_recent_items se miden contra el reloj: sin
  // congelarlo, las fixtures del 26/08 quedan fuera de las últimas 24 h a
  // partir del 27 y el test empieza a fallar solo por el paso del tiempo.
  // Solo se falsea Date: los timers reales siguen andando para el async.
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-26T16:00:00.000Z"));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    importReport.mockClear();
    saveClientBrief.mockClear();
    saveClaudeLink.mockClear();
    brief = { ...brief, pendingUpdates: [] };
    link = { conversationUrl: "https://claude.ai/chat/x" };
  });

  it("expone exactamente las 10 tools de la spec, con descripción y schema", () => {
    expect(tools.map((t) => t.name)).toEqual([
      "get_project",
      "get_brief",
      "propose_brief_updates",
      "get_metrics",
      "get_recent_items",
      "get_run_status",
      "list_reports",
      "get_report",
      "save_report",
      "link_conversation",
    ]);
    expect(tools.map((t) => t.name)).toEqual([...TOOL_NAMES]);
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(20);
      expect(typeof t.inputSchema.parse).toBe("function");
    }
  });

  it("ninguna tool acepta projectId: el proyecto lo resuelve el token", () => {
    for (const t of tools) {
      expect(Object.keys(t.inputSchema.shape)).not.toContain("projectId");
    }
  });

  it("get_project: nombre, zona, conversación, hitos, cuentas por categoría, brief y último informe", async () => {
    const out = await run("get_project");
    expect(out).toContain("Ferro");
    expect(out).toContain("Caballito");
    expect(out).toContain("https://claude.ai/chat/x");
    expect(out).toMatch(/Elección/);
    expect(out).toContain("organizacion");
    expect(out).toContain("@somosferro2026");
    expect(out).toContain("2026-08-26");
  });

  it("get_brief: devuelve maestro + aportes y las propuestas pendientes", async () => {
    brief = { ...brief, pendingUpdates: [{ id: "u1", seccion: "3.5", texto: "Cuenta nueva", reportAt: "2026-08-26T00:00:00.000Z", status: "pending" }] };
    const out = await run("get_brief");
    expect(out).toContain("# BRIEF MAESTRO");
    expect(out).toContain("Aporte del operador.");
    expect(out).toContain("3.5");
    expect(out).toContain("Cuenta nueva");
  });

  it("propose_brief_updates: deja pendientes, nunca edita el maestro", async () => {
    const out = await run("propose_brief_updates", { updates: [{ seccion: "3.5", texto: "Hecho nuevo" }] });
    expect(out).toMatch(/1/);
    expect(brief.pendingUpdates?.[0]).toMatchObject({ seccion: "3.5", texto: "Hecho nuevo", status: "pending" });
    expect(brief.master?.text).toBe("# BRIEF MAESTRO\n\nClub Ferro.");
  });

  it("propose_brief_updates: sin updates válidas no guarda", async () => {
    await expect(run("propose_brief_updates", { updates: [] })).rejects.toThrow();
    expect(saveClientBrief).not.toHaveBeenCalled();
  });

  it("get_metrics: una línea por cuenta y la muestra anonimizada de comentarios", async () => {
    const out = await run("get_metrics", { days: 7 });
    expect(out).toContain("@somosferro2026");
    expect(out).toContain("seg:1200");
    expect(out).toContain("dens:50%");
    expect(out).toContain("[c1]");
  });

  it("get_recent_items: filtra por ventana horaria y por fuente, y respeta el límite", async () => {
    const out = await run("get_recent_items", { hours: 24 });
    expect(out).toContain("propuesta de salud mental");
    expect(out).not.toContain("perdieron las elecciones hoy");
    const todo = await run("get_recent_items", { hours: 24 * 30 });
    expect(todo).toContain("perdieron las elecciones hoy");
    const soloX = await run("get_recent_items", { hours: 24 * 30, source: "x" });
    expect(soloX).toContain("perdieron las elecciones hoy");
    expect(soloX).not.toContain("propuesta de salud mental");
    const uno = await run("get_recent_items", { hours: 24 * 30, limit: 1 });
    expect(uno.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(1);
  });

  it("get_recent_items: el filtro es por fuente, no por autor", async () => {
    // "ferroenaccion" es el autor de la mención de instagram: el filtro dice
    // fuente y tiene que decir la verdad, si no el modelo cree que filtró y no.
    const porAutor = await run("get_recent_items", { hours: 24 * 30, source: "ferroenaccion" });
    expect(porAutor).toContain("sin menciones");
    expect(porAutor).not.toContain("propuesta de salud mental");
  });

  it("get_run_status: última corrida con sus errores", async () => {
    const out = await run("get_run_status");
    expect(out).toContain("2026-08-26");
    expect(out).toContain("6");
    expect(out).toContain("instagram");
    expect(out).toContain("400");
  });

  it("list_reports: at, título, origen e items24h; los previos al campo dicen tronador", async () => {
    const out = await run("list_reports", { limit: 10 });
    expect(out).toContain("2026-08-26T15:00:00.000Z");
    expect(out).toContain("Tesis del 26");
    expect(out).toContain("claude-chrome");
    expect(out).toContain("Tesis del 25");
    expect(out).toContain("tronador");
  });

  it("get_report: sin at devuelve el último; con at, el del historial", async () => {
    expect(await run("get_report")).toContain("# Tesis del 26");
    expect(await run("get_report", { at: "2026-08-25T15:00:00.000Z" })).toContain("# Tesis del 25");
    await expect(run("get_report", { at: "2020-01-01T00:00:00.000Z" })).rejects.toThrow(/no hay informe/i);
  });

  it("save_report: delega en importReport con origen claude-chrome y la conversación vinculada", async () => {
    const out = await run("save_report", { html: "<h1>x</h1><p>y</p>", titulo: "T", enviarMail: true });
    expect(importReport).toHaveBeenCalledTimes(1);
    const [pid, input] = importReport.mock.calls[0] as unknown as [string, import("@/lib/report-import").ImportReportInput];
    expect(pid).toBe("p1");
    expect(input.origen).toBe("claude-chrome");
    expect(input.conversationUrl).toBe("https://claude.ai/chat/x");
    expect(input.enviarMail).toBe(true);
    expect(out).toContain("2026-08-26T15:30:00.000Z");
    expect(out).toContain("4");
  });

  it("save_report: sin markdown ni html no llama a importReport", async () => {
    await expect(run("save_report", {})).rejects.toThrow(/markdown|html/i);
    expect(importReport).not.toHaveBeenCalled();
  });

  it("link_conversation: guarda la URL válida y marca linkedAt", async () => {
    const out = await run("link_conversation", { conversationUrl: "https://claude.ai/chat/nueva" });
    expect(link.conversationUrl).toBe("https://claude.ai/chat/nueva");
    expect(link.linkedAt).toBeTruthy();
    expect(out).toContain("https://claude.ai/chat/nueva");
  });

  it("link_conversation: rechaza cualquier URL que no sea de claude.ai", async () => {
    await expect(run("link_conversation", { conversationUrl: "https://chatgpt.com/c/x" })).rejects.toThrow(/claude\.ai/);
    expect(saveClaudeLink).not.toHaveBeenCalled();
  });
});
