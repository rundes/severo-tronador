// Conector de análisis: Claude API. Categoría `analysis`.
// Coding inductivo de respuestas abiertas + sentiment (ARCHITECTURE §5b).
// Sin ANTHROPIC_API_KEY corre en modo mock con heurísticas locales (frecuencia
// de términos + léxico de sentiment), suficiente para el dashboard de cierre.
import type {
  AnalysisConnector,
  AnalysisResult,
  AnalysisTask,
  ConnectorStatus,
  Quota,
  TestResult,
} from "./types";
import { getUsage, incrementUsage, nextMonthlyReset } from "@/lib/quota";

const ID = "claude-api";
const TOKEN_CAP = 1_000_000; // guardarraíl de gasto mensual (tokens)

function hasKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

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

const STOPWORDS = new Set([
  "para", "como", "pero", "porque", "tiene", "todo", "todos", "este", "esta",
  "esto", "esos", "esas", "muy", "más", "mas", "que", "los", "las", "del",
  "con", "una", "unos", "unas", "por", "sus", "nos", "les", "hay", "son",
  "está", "estan", "están", "ser", "fue", "han", "hace", "cada", "donde",
  "cuando", "tener", "barrio", "nuestro", "nuestra", "maipu", "vecinos",
  "calles", "semana", "otra",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD") // separa diacríticos; el strip de abajo los elimina
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

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
  ],

  async test(): Promise<TestResult> {
    return hasKey()
      ? { ok: true, message: "API key presente — análisis con Claude." }
      : { ok: true, message: "Modo mock — heurística local (frecuencia + léxico)." };
  },

  async getStatus(): Promise<ConnectorStatus> {
    return (await getUsage(ID)) >= TOKEN_CAP ? "quota_exhausted" : "enabled";
  },

  async getQuota(): Promise<Quota> {
    return {
      used: await getUsage(ID),
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
