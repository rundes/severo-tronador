// Cliente mínimo de Google AI Studio (Gemini / Generative Language API).
// Server-only. Usa la API key del conector google-ai. Fetch directo, sin SDK.
const BASE = "https://generativelanguage.googleapis.com/v1beta";
// Modelos vigentes (los 2.0 quedaron deprecados). Override por
// GOOGLE_AI_MODEL / GOOGLE_AI_IMAGE_MODEL o el campo "Modelo" del conector.
const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-image-preview";

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

export interface GeminiImage {
  base64: string;
  mime: string;
}

// Genera una imagen con Gemini (modelo de imagen de Google AI Studio).
// Devuelve los bytes en base64 + mime. Lanza si la respuesta no trae imagen.
export async function generateGeminiImage({
  apiKey,
  prompt,
  model,
}: {
  apiKey: string;
  prompt: string;
  model?: string;
}): Promise<GeminiImage> {
  const mdl = model || process.env.GOOGLE_AI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
  const res = await fetch(
    `${BASE}/models/${mdl}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
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
    candidates?: {
      content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] };
    }[];
  };
  for (const part of data.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) {
      return {
        base64: part.inlineData.data,
        mime: part.inlineData.mimeType ?? "image/png",
      };
    }
  }
  throw new Error("El modelo no devolvió una imagen. Probá otro prompt o modelo.");
}
