import { describe, it, expect, vi, beforeEach } from "vitest";
const generateText = vi.fn();
vi.mock("@/lib/anthropic", () => ({ generateText: (...a: unknown[]) => generateText(...a) }));
vi.mock("@/lib/connectors/config", () => ({ getConnectorConfig: async () => ({ ANTHROPIC_API_KEY: "k" }) }));
vi.mock("@/lib/quota", () => ({ incrementUsage: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/client-brief", async (o) => ({ ...(await o<typeof import("@/lib/client-brief")>()), getClientBrief: async () => ({ entries: [{ id: "1", at: "2026-08-25T00:00:00.000Z", by: "a", text: "Club Ferro, elecciones en septiembre" }], suggestions: [] }) }));
vi.mock("@/lib/monitor-config", async (o) => ({ ...(await o<typeof import("@/lib/monitor-config")>()), getMonitorConfig: async () => ({ accounts: [{ handle: "ferrocarriloeste", platform: "instagram", category: "institucional" }], searchesA: ["Ferro oficialismo"], searchesB: ["Ferro oposición"], entidades: { Etcheverri: "estadio" }, noRepetir: ["no atribuir sin evidencia"], calendar: [], budget: {} }) }));

import { buildCandidatePrompt, parseCandidateJson, classifyCandidates, candidateMaxTokens } from "@/lib/candidate-ai";

const CANDS = [
  { platform: "x" as const, handle: "desocios", displayName: "De Socios", followers: 900, sample: [{ url: "https://x.com/DeSocios/status/1", text: "acaban de perder las elecciones antes de las elecciones", at: "2026-08-25" }] },
  { platform: "instagram" as const, handle: "memesdefutbol", sample: [] },
];
const fence = (o: unknown) => "```json\n" + JSON.stringify(o) + "\n```";

describe("candidate-ai", () => {
  beforeEach(() => generateText.mockReset());

  it("prompt incluye brief, escenario y candidatos numerados", () => {
    const { system, prompt } = buildCandidatePrompt({ brief: "[fecha · a] Club Ferro", accounts: [{ handle: "ferrocarriloeste", platform: "instagram", category: "institucional" }], searchesA: ["A1"], searchesB: ["B1"], entidades: { E: "d" }, noRepetir: ["n"], candidates: CANDS });
    expect(system).toMatch(/SOLO un bloque/);
    expect(prompt).toContain("Club Ferro"); expect(prompt).toContain("A1"); expect(prompt).toContain("1. [x] @desocios"); expect(prompt).toContain("2. [instagram] @memesdefutbol");
  });

  it("parseo: relevantes con evidencia válida; evidencia ajena → primera muestra; índice inválido descartado", () => {
    const out = parseCandidateJson(fence({ candidatos: [
      { i: 1, relevante: true, category: "organizacion", direccion: "B", razon: "reclama elecciones", evidencia: "https://otro" },
      { i: 2, relevante: false, category: "individual", direccion: "?", razon: "memes" },
      { i: 9, relevante: true, category: "medio", direccion: "A", razon: "x" },
    ] }), CANDS);
    expect(out).toEqual([{ handle: "desocios", platform: "x", category: "organizacion", direccion: "B", razon: "reclama elecciones", evidencia: "https://x.com/DeSocios/status/1", origen: "barrido", followers: 900, displayName: "De Socios" }]);
  });

  it("JSON roto → throw", () => {
    expect(() => parseCandidateJson("nada", CANDS)).toThrow();
  });

  it("classifyCandidates arma el prompt con brief/escenario y devuelve relevantes", async () => {
    generateText.mockResolvedValue({ text: fence({ candidatos: [{ i: 1, relevante: true, category: "organizacion", direccion: "B", razon: "r", evidencia: "https://x.com/DeSocios/status/1" }] }), inputTokens: 1, outputTokens: 1 });
    const r = await classifyCandidates("p1", CANDS);
    expect(r.map((x) => x.handle)).toEqual(["desocios"]);
    expect(generateText.mock.calls[0][0].prompt).toContain("Ferro oficialismo");
    expect(generateText.mock.calls[0][0].maxTokens).toBe(candidateMaxTokens(CANDS.length));
  });

  it("candidateMaxTokens crece con el lote y se tapa en 4096", () => {
    expect(candidateMaxTokens(2)).toBe(420);
    expect(candidateMaxTokens(100)).toBe(4096);
  });
});
