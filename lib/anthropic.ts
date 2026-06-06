// Cliente mínimo de la API de Anthropic (Messages). Server-only.
// Usa la API key del conector claude-api (la cuenta de Claude del usuario).
// No depende del SDK: un fetch directo a /v1/messages.

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
// Modelo por defecto; se puede sobreescribir con ANTHROPIC_MODEL.
const DEFAULT_MODEL = "claude-sonnet-4-6";

export interface GenerateInput {
  apiKey: string;
  system?: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}

export interface GenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export async function generateText({
  apiKey,
  system,
  prompt,
  model,
  maxTokens = 4096,
}: GenerateInput): Promise<GenerateResult> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) detail = body.error.message;
    } catch {
      // sin cuerpo JSON; queda el HTTP status
    }
    throw new Error(detail);
  }

  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("")
    .trim();

  return {
    text,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}
