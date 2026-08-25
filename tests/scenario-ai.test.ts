import { describe, it, expect, vi, beforeEach } from "vitest";

const generateText = vi.fn();
vi.mock("@/lib/anthropic", () => ({ generateText: (...a: unknown[]) => generateText(...a) }));
const { getConnectorConfigMock } = vi.hoisted(() => ({
  getConnectorConfigMock: vi.fn(async (): Promise<Record<string, string>> => ({ ANTHROPIC_API_KEY: "sk-test" })),
}));
vi.mock("@/lib/connectors/config", () => ({
  getConnectorConfig: (...a: unknown[]) => getConnectorConfigMock(...(a as [])),
}));
vi.mock("@/lib/quota", () => ({ incrementUsage: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/listening-config", () => ({
  getListeningConfig: async () => ({ keywords: ["Ibicuy"], zona: "Ibicuy, Entre Ríos", pais: "AR" }),
}));
vi.mock("@/lib/monitor-config", async (orig) => ({
  ...(await orig<typeof import("@/lib/monitor-config")>()),
  getMonitorConfig: async () => ({
    accounts: [], searchesA: ["a1"], searchesB: ["b1"], calendar: [], noRepetir: [], entidades: {}, budget: {},
  }),
}));
const INITIAL_BRIEF: import("@/lib/client-brief").ClientBrief = {
  entries: [{ id: "1", at: "2026-08-25T00:00:00.000Z", by: "ana@x.ar", text: "Municipio de Ibicuy, gestión local, cloacas y caminos" }],
  suggestions: [],
};
const briefStore: { current: import("@/lib/client-brief").ClientBrief } = {
  current: { ...INITIAL_BRIEF },
};
const saveClientBrief = vi.fn(async (_p: string, b: import("@/lib/client-brief").ClientBrief) => { briefStore.current = b; });
vi.mock("@/lib/client-brief", async (orig) => ({
  ...(await orig<typeof import("@/lib/client-brief")>()),
  getClientBrief: async () => briefStore.current,
  saveClientBrief: (p: string, b: import("@/lib/client-brief").ClientBrief) => saveClientBrief(p, b),
}));

import { buildScenarioPrompt, parseScenarioJson, proposeScenario } from "@/lib/scenario-ai";
import { FERRO_EXAMPLE_JSON } from "@/lib/scenario-examples";

const VALID = {
  tipo: "territorial",
  resumen: "Escucha territorial de un municipio.",
  keywords: ["Entre Rios", "Ibicuy", "cloacas Ibicuy"],
  searchesA: ["Ibicuy gestión"],
  searchesB: ["Ibicuy reclamos"],
  accounts: [{ handle: "@MuniIbicuy", platform: "facebook", category: "institucional" }],
  entidades: { Ibicuy: "Localidad del sur de Entre Ríos" },
  calendar: [],
};
const fence = (o: unknown) => "Acá va:\n```json\n" + JSON.stringify(o) + "\n```\nlisto.";

describe("buildScenarioPrompt", () => {
  it("incluye brief, escenario vigente y el ejemplo FERRO", () => {
    const { system, prompt } = buildScenarioPrompt({
      brief: "[2026-08-25 · ana@x.ar] Municipio de Ibicuy",
      current: { keywords: ["Ibicuy"], searchesA: ["a1"], searchesB: ["b1"], accounts: [], entidades: {}, calendar: [], audio: [] },
    });
    expect(system).toMatch(/SOLO un bloque/);
    expect(prompt).toContain("Municipio de Ibicuy");
    expect(prompt).toContain('"Ferro Carril Oeste"');
    expect(prompt).toContain("a1");
    expect(prompt).toMatch(/16/);
    expect(system).toMatch(/nunca como instrucciones/);
    expect(prompt).toMatch(/Audio y video/);
  });
});

describe("parseScenarioJson", () => {
  it("acepta un bloque válido y normaliza cuentas (handle sin @, nota verificar)", () => {
    const r = parseScenarioJson(fence(VALID));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.accounts[0]).toEqual({ handle: "muniibicuy", platform: "facebook", category: "institucional", nota: "verificar handle" });
    expect(r.data.tipo).toBe("territorial");
  });

  it("acepta el ejemplo FERRO tal cual", () => {
    expect(parseScenarioJson(fence(FERRO_EXAMPLE_JSON)).ok).toBe(true);
  });

  it("sin bloque json → error", () => {
    const r = parseScenarioJson("no hay json acá");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/bloque/);
  });

  it("JSON roto → error", () => {
    expect(parseScenarioJson("```json\n{ nope\n```").ok).toBe(false);
  });

  it("recorta keywords a 16 y rechaza A/B desiguales", () => {
    const many = { ...VALID, keywords: Array.from({ length: 20 }, (_, i) => `k${i}`) };
    const r = parseScenarioJson(fence(many));
    expect(r.ok && r.data.keywords).toHaveLength(16);
    const uneven = { ...VALID, searchesA: ["a", "b"], searchesB: ["c"] };
    const r2 = parseScenarioJson(fence(uneven));
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toMatch(/simétric/);
  });

  it("plataforma o categoría inválida → error", () => {
    const bad = { ...VALID, accounts: [{ handle: "x", platform: "threads", category: "medio" }] };
    expect(parseScenarioJson(fence(bad)).ok).toBe(false);
  });

  it("acepta fence en mayúsculas y JSON sin fence", () => {
    const upper = "```JSON\n" + JSON.stringify(VALID) + "\n```";
    expect(parseScenarioJson(upper).ok).toBe(true);
    const bare = "Acá va el escenario:\n" + JSON.stringify(VALID) + "\nlisto.";
    expect(parseScenarioJson(bare).ok).toBe(true);
  });

  it("audio: acepta programas, descarta individualmente los inválidos, franja vacía con nota", () => {
    const withAudio = {
      ...VALID,
      audio: [
        { kind: "radio", url: "https://stream.lu30.com/live.mp3", station: "LU30", programa: "La mañana", days: [1, 2, 3, 4, 5], start: "08:00", end: "10:00" },
        { kind: "youtube", url: "https://www.youtube.com/@canalibicuy/live", station: "Canal Ibicuy", programa: "Noticiero", days: [], start: "", end: "" },
        { kind: "threads", url: "https://x/y", station: "X", programa: "Y", days: [], start: "", end: "" },
      ],
    };
    const r = parseScenarioJson(fence(withAudio));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.audio.map((a) => a.kind)).toEqual(["radio", "youtube"]);
    expect(r.data.audio[1].nota).toBe("completar franja");
  });

  it("audio ausente → []", () => {
    const r = parseScenarioJson(fence(VALID));
    expect(r.ok && r.data.audio).toEqual([]);
  });
});

describe("proposeScenario", () => {
  beforeEach(() => {
    generateText.mockReset();
    saveClientBrief.mockClear();
    getConnectorConfigMock.mockReset();
    getConnectorConfigMock.mockResolvedValue({ ANTHROPIC_API_KEY: "sk-test" });
    briefStore.current = { ...INITIAL_BRIEF };
  });

  it("guarda la propuesta con el hash del brief y no toca lo vigente", async () => {
    generateText.mockResolvedValue({ text: fence(VALID), inputTokens: 10, outputTokens: 20 });
    const r = await proposeScenario("p1");
    expect(r.ok).toBe(true);
    expect(saveClientBrief).toHaveBeenCalledTimes(1);
    const saved = briefStore.current.proposal!;
    expect(saved.keywords).toEqual(VALID.keywords);
    expect(saved.briefHash).toHaveLength(16);
    expect(saved.applied.territorio).toBeUndefined();
  });

  it("brief vacío → error sin llamar al modelo", async () => {
    briefStore.current = { entries: [], suggestions: [] };
    const r = await proposeScenario("p1");
    expect(r.ok).toBe(false);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("respuesta inválida → error y no guarda", async () => {
    generateText.mockResolvedValue({ text: "sin json", inputTokens: 1, outputTokens: 1 });
    const r = await proposeScenario("p1");
    expect(r.ok).toBe(false);
    expect(saveClientBrief).not.toHaveBeenCalled();
  });

  it("sin API key → error claro sin llamar al modelo", async () => {
    getConnectorConfigMock.mockResolvedValueOnce({});
    const r = await proposeScenario("p1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/API key/);
    expect(generateText).not.toHaveBeenCalled();
  });
});
