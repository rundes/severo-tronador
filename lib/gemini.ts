// Cliente mínimo de Google AI Studio (Gemini / Generative Language API).
// Server-only. Usa la API key del conector google-ai. Fetch directo, sin SDK.
const BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.0-flash";

export interface GeminiInput {
  apiKey: string;
  system?: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}

export interface GeminiResult {
  text: string;
}

export async function generateGeminiText({
  apiKey,
  system,
  prompt,
  model,
  maxTokens = 2048,
}: GeminiInput): Promise<GeminiResult> {
  const mdl = model || process.env.GOOGLE_AI_MODEL || DEFAULT_MODEL;
  const res = await fetch(
    `${BASE}/models/${mdl}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.9 },
      }),
    },
  );

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) detail = body.error.message;
    } catch {
      // sin cuerpo JSON
    }
    throw new Error(detail);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  return { text };
}
