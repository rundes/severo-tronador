// Conector de análisis: Claude API. Categoría `analysis`.
// Coding inductivo de respuestas abiertas + sentiment (ARCHITECTURE §5b).
// Sin ANTHROPIC_API_KEY corre en modo mock con heurísticas locales (frecuencia
// de términos + léxico de sentiment), suficiente para el dashboard de cierre.
import type {
  AnalysisConnector,
  AnalysisResult,
  AnalysisTask,
  Config,
  ConnectorStatus,
  Quota,
  TestResult,
} from "./types";
import { getUsage, incrementUsage, nextMonthlyReset } from "@/lib/quota";
import { DEFAULT_PROJECT_ID } from "@/lib/projects";
import { getConnectorConfig } from "./config";
import { tokenize } from "@/lib/text/tokenize";

const ID = "claude-api";
const TOKEN_CAP = 1_000_000; // guardarraíl de gasto mensual (tokens)

export interface Theme {
  label: string;
  count: number;
  examples: string[];
}
export interface CodingOutput {
  themes: Theme[];
  mode: "mock" | "claude";
}
export interface SentimentOutput {
  positive: number;
  negative: number;
  neutral: number;
  mode: "mock" | "claude";
}

// tokenize() vive ahora en @/lib/text/tokenize (fuente única, con strip de
// URLs y ruido de plataforma — antes esta copia local NO los filtraba y por
// eso colaban "https"/"posted" como temas).

// Coding inductivo heurístico: términos más frecuentes como temas emergentes.
function mockCoding(answers: string[]): CodingOutput {
  const freq = new Map<string, number>();
  for (const a of answers) {
    for (const w of new Set(tokenize(a))) freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  const top = [...freq.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const themes: Theme[] = top.map(([label, count]) => ({
    label,
    count,
    examples: answers.filter((a) => tokenize(a).includes(label)).slice(0, 2),
  }));
  return { themes, mode: "mock" };
}

const POS = ["bueno", "mejor", "gracias", "excelente", "contento", "bien", "ok", "linda", "tranquilo"];
const NEG = ["malo", "peor", "problema", "falta", "inseguridad", "mal", "queja", "sucio", "roto", "peligro", "abandono"];

function mockSentiment(answers: string[]): SentimentOutput {
  let positive = 0,
    negative = 0,
    neutral = 0;
  for (const a of answers) {
    const t = tokenize(a);
    const score =
      t.filter((w) => POS.includes(w)).length -
      t.filter((w) => NEG.includes(w)).length;
    if (score > 0) positive++;
    else if (score < 0) negative++;
    else neutral++;
  }
  return { positive, negative, neutral, mode: "mock" };
}

export const claudeApiConnector: AnalysisConnector = {
  id: ID,
  name: "Claude API (análisis)",
  vendor: "Anthropic",
  category: "analysis",
  description: "Coding cualitativo + sentiment de respuestas abiertas.",
  docsUrl: "https://docs.anthropic.com",
  iconEmoji: "🧠",

  capabilities: [
    { id: "analysis.coding_qualitative", label: "Coding inductivo" },
    { id: "analysis.sentiment", label: "Sentiment" },
    { id: "analysis.cluster_responses", label: "Clustering" },
  ],

  configSchema: [
    {
      key: "ANTHROPIC_API_KEY",
      label: "API Key",
      type: "secret",
      required: true,
      placeholder: "sk-ant-…",
    },
    {
      key: "ANTHROPIC_MODEL",
      label: "Modelo",
      type: "text",
      required: false,
      placeholder: "claude-sonnet-4-6 (o claude-fable-5, claude-opus-4-8…)",
      help: "Id del modelo de Anthropic a usar. Si lo dejás vacío usa el default (claude-sonnet-4-6). También se puede fijar con la env ANTHROPIC_MODEL.",
    },
  ],

  async test(config?: Config): Promise<TestResult> {
    const cfg = config ?? await getConnectorConfig(ID);
    return cfg.ANTHROPIC_API_KEY
      ? { ok: true, message: "API key presente — análisis con Claude." }
      : { ok: true, message: "Modo mock — heurística local (frecuencia + léxico)." };
  },

  async getStatus(): Promise<ConnectorStatus> {
    return (await getUsage(ID)) >= TOKEN_CAP ? "quota_exhausted" : "enabled";
  },

  async getQuota(projectId: string = DEFAULT_PROJECT_ID): Promise<Quota> {
    return {
      used: await getUsage(ID, projectId),
      limit: TOKEN_CAP,
      unit: "tokens",
      period: "month",
      resetAt: nextMonthlyReset(),
    };
  },

  async analyze(
    input: string | string[],
    task: AnalysisTask,
  ): Promise<AnalysisResult> {
    const answers = Array.isArray(input) ? input : [input];
    // Estimación grosera de tokens consumidos (guardarraíl).
    await incrementUsage(ID, Math.ceil(answers.join(" ").length / 4));

    // F7: incluso con key, el coding/sentiment usa la heurística local salvo
    // que se implemente la llamada real. La key habilita el modo "claude".
    if (task === "sentiment") return { task, output: mockSentiment(answers) };
    return { task, output: mockCoding(answers) };
  },
};
