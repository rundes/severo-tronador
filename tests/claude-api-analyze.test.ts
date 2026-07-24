import { describe, it, expect, beforeEach, vi } from "vitest";

// analyze() del conector claude-api: con ANTHROPIC_API_KEY llama a Claude de
// verdad (vía lib/anthropic.generateText) y devuelve mode "claude"; sin key o
// ante error/JSON inválido cae a la heurística local (mode "mock").

beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  vi.resetModules();
});

function mockConfig(cfg: Record<string, string>) {
  vi.doMock("@/lib/connectors/config", () => ({
    getConnectorConfig: vi.fn(async () => cfg),
  }));
}

const ANSWERS = [
  "me preocupa la inseguridad en el barrio",
  "faltan luminarias y hay inseguridad",
  "estoy contento con la nueva plaza",
];

describe("claude-api analyze — con API key", () => {
  it("coding_qualitative llama a Claude y parsea temas (mode claude)", async () => {
    mockConfig({ ANTHROPIC_API_KEY: "sk-ant-test" });
    const generateText = vi.fn(async () => ({
      text: JSON.stringify({
        themes: [
          { label: "inseguridad", count: 2, examples: ["me preocupa la inseguridad en el barrio"] },
          { label: "espacios públicos", count: 1, examples: ["estoy contento con la nueva plaza"] },
        ],
      }),
      inputTokens: 120,
      outputTokens: 60,
    }));
    vi.doMock("@/lib/anthropic", () => ({ generateText }));

    const { claudeApiConnector } = await import("@/lib/connectors/claude-api");
    const r = await claudeApiConnector.analyze(ANSWERS, "coding_qualitative");
    const out = r.output as { themes: { label: string }[]; mode: string };

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(out.mode).toBe("claude");
    expect(out.themes.map((t) => t.label)).toEqual(["inseguridad", "espacios públicos"]);
  });

  it("sentiment llama a Claude y parsea conteos (mode claude)", async () => {
    mockConfig({ ANTHROPIC_API_KEY: "sk-ant-test" });
    const generateText = vi.fn(async () => ({
      text: JSON.stringify({ positive: 1, negative: 2, neutral: 0 }),
      inputTokens: 80,
      outputTokens: 20,
    }));
    vi.doMock("@/lib/anthropic", () => ({ generateText }));

    const { claudeApiConnector } = await import("@/lib/connectors/claude-api");
    const r = await claudeApiConnector.analyze(ANSWERS, "sentiment");
    const out = r.output as { positive: number; negative: number; neutral: number; mode: string };

    expect(out).toMatchObject({ positive: 1, negative: 2, neutral: 0, mode: "claude" });
  });

  it("acepta JSON envuelto en fences de markdown", async () => {
    mockConfig({ ANTHROPIC_API_KEY: "sk-ant-test" });
    const generateText = vi.fn(async () => ({
      text: '```json\n{"positive":3,"negative":0,"neutral":0}\n```',
      inputTokens: 10,
      outputTokens: 10,
    }));
    vi.doMock("@/lib/anthropic", () => ({ generateText }));

    const { claudeApiConnector } = await import("@/lib/connectors/claude-api");
    const r = await claudeApiConnector.analyze(ANSWERS, "sentiment");
    expect((r.output as { mode: string }).mode).toBe("claude");
  });

  it("si Claude falla cae a la heurística local (mode mock)", async () => {
    mockConfig({ ANTHROPIC_API_KEY: "sk-ant-test" });
    const generateText = vi.fn(async () => {
      throw new Error("HTTP 529");
    });
    vi.doMock("@/lib/anthropic", () => ({ generateText }));

    const { claudeApiConnector } = await import("@/lib/connectors/claude-api");
    const r = await claudeApiConnector.analyze(ANSWERS, "sentiment");
    expect((r.output as { mode: string }).mode).toBe("mock");
  });

  it("si la respuesta no es JSON válido cae a la heurística local", async () => {
    mockConfig({ ANTHROPIC_API_KEY: "sk-ant-test" });
    const generateText = vi.fn(async () => ({
      text: "Los temas principales son la inseguridad y las plazas.",
      inputTokens: 10,
      outputTokens: 10,
    }));
    vi.doMock("@/lib/anthropic", () => ({ generateText }));

    const { claudeApiConnector } = await import("@/lib/connectors/claude-api");
    const r = await claudeApiConnector.analyze(ANSWERS, "coding_qualitative");
    expect((r.output as { mode: string }).mode).toBe("mock");
  });

  it("con respuestas vacías no llama a Claude", async () => {
    mockConfig({ ANTHROPIC_API_KEY: "sk-ant-test" });
    const generateText = vi.fn();
    vi.doMock("@/lib/anthropic", () => ({ generateText }));

    const { claudeApiConnector } = await import("@/lib/connectors/claude-api");
    const r = await claudeApiConnector.analyze([], "coding_qualitative");
    expect(generateText).not.toHaveBeenCalled();
    expect((r.output as { themes: unknown[] }).themes).toEqual([]);
  });
});

describe("claude-api analyze — sin API key", () => {
  it("usa la heurística local y no llama a Claude", async () => {
    mockConfig({});
    const generateText = vi.fn();
    vi.doMock("@/lib/anthropic", () => ({ generateText }));

    const { claudeApiConnector } = await import("@/lib/connectors/claude-api");
    const r = await claudeApiConnector.analyze(ANSWERS, "coding_qualitative");
    expect(generateText).not.toHaveBeenCalled();
    expect((r.output as { mode: string }).mode).toBe("mock");
  });
});

describe("claude-api test()", () => {
  it("con key promete análisis real con Claude", async () => {
    mockConfig({ ANTHROPIC_API_KEY: "sk-ant-test" });
    const { claudeApiConnector } = await import("@/lib/connectors/claude-api");
    const t = await claudeApiConnector.test();
    expect(t.ok).toBe(true);
    expect(t.message).toMatch(/Claude/);
    expect(t.message).not.toMatch(/pendiente/i);
  });
});
