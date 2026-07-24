// Conector de análisis: Claude API. Categoría `analysis`.
// Coding inductivo de respuestas abiertas + sentiment (ARCHITECTURE §5b).
// Con ANTHROPIC_API_KEY llama a Claude (Messages API vía lib/anthropic) y
// devuelve mode "claude". Sin key — o si Claude falla o responde JSON
// inválido — cae a las heurísticas locales (frecuencia de términos + léxico
// de sentiment), suficiente para no romper el dashboard de cierre.
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
import { generateText } from "@/lib/anthropic";

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

// --- Análisis real con Claude -------------------------------------------

// El modelo responde a veces con fences de markdown alrededor del JSON.
function parseJson<T>(raw: string): T | null {
  const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(clean) as T;
  } catch {
    return null;
  }
}

const CODING_SYSTEM =
  "Sos un analista cualitativo de opinión pública. Hacés coding inductivo de " +
  "respuestas abiertas de vecinos (español rioplatense). Respondé SOLO con JSON " +
  "válido, sin markdown ni texto extra.";

const SENTIMENT_SYSTEM =
  "Clasificás el sentiment de respuestas abiertas de vecinos (español " +
  "rioplatense). Respondé SOLO con JSON válido, sin markdown ni texto extra.";

async function claudeCoding(
  apiKey: string,
  model: string | undefined,
  answers: string[],
): Promise<{ output: CodingOutput; tokens: number } | null> {
  const prompt =
    "Analizá estas respuestas y extraé hasta 6 temas emergentes. Para cada tema: " +
    '"label" (2-4 palabras, en minúsculas), "count" (cantidad de respuestas que lo ' +
    'mencionan) y "examples" (hasta 2 citas textuales). Formato exacto: ' +
    '{"themes":[{"label":"...","count":N,"examples":["..."]}]}\n\nRespuestas:\n' +
    answers.map((a, i) => `${i + 1}. ${a}`).join("\n");
  const r = await generateText({ apiKey, model, system: CODING_SYSTEM, prompt });
  const parsed = parseJson<{ themes?: Theme[] }>(r.text);
  if (!parsed || !Array.isArray(parsed.themes)) return null;
  const themes = parsed.themes
    .filter((t) => t && typeof t.label === "string")
    .slice(0, 6)
    .map((t) => ({
      label: t.label,
      count: typeof t.count === "number" ? t.count : 0,
      examples: Array.isArray(t.examples) ? t.examples.slice(0, 2) : [],
    }));
  return {
    output: { themes, mode: "claude" },
    tokens: r.inputTokens + r.outputTokens,
  };
}

async function claudeSentiment(
  apiKey: string,
  model: string | undefined,
  answers: string[],
): Promise<{ output: SentimentOutput; tokens: number } | null> {
  const prompt =
    "Clasificá cada respuesta como positiva, negativa o neutral y devolvé los " +
    'conteos totales. Formato exacto: {"positive":N,"negative":N,"neutral":N}\n\n' +
    "Respuestas:\n" +
    answers.map((a, i) => `${i + 1}. ${a}`).join("\n");
  const r = await generateText({ apiKey, model, system: SENTIMENT_SYSTEM, prompt });
  const parsed = parseJson<{ positive?: number; negative?: number; neutral?: number }>(r.text);
  if (
    !parsed ||
    typeof parsed.positive !== "number" ||
    typeof parsed.negative !== "number" ||
    typeof parsed.neutral !== "number"
  ) {
    return null;
  }
  return {
    output: {
      positive: parsed.positive,
      negative: parsed.negative,
      neutral: parsed.neutral,
      mode: "claude",
    },
    tokens: r.inputTokens + r.outputTokens,
  };
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
      ? { ok: true, message: "API key presente — coding/sentiment reales con Claude (fallback heurístico si falla)." }
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

    const cfg = await getConnectorConfig(ID);
    if (cfg.ANTHROPIC_API_KEY && answers.length > 0) {
      try {
        const r =
          task === "sentiment"
            ? await claudeSentiment(cfg.ANTHROPIC_API_KEY, cfg.ANTHROPIC_MODEL, answers)
            : await claudeCoding(cfg.ANTHROPIC_API_KEY, cfg.ANTHROPIC_MODEL, answers);
        if (r) {
          await incrementUsage(ID, r.tokens);
          return { task, output: r.output };
        }
        // JSON inválido → cae a la heurística.
      } catch {
        // Error de red/API → cae a la heurística (el cierre nunca se rompe).
      }
    }

    // Heurística local (sin key, sin respuestas, o fallback ante error).
    await incrementUsage(ID, Math.ceil(answers.join(" ").length / 4));
    if (task === "sentiment") return { task, output: mockSentiment(answers) };
    return { task, output: mockCoding(answers) };
  },
};
