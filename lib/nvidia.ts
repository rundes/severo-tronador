// lib/nvidia.ts
// Cliente de NVIDIA NIM (API OpenAI-compatible, integrate.api.nvidia.com).
// Server-only. Fetch directo, sin SDK. Misma forma que siliconflowChat.
export const NVIDIA_BASE = (
  process.env.NVIDIA_BASE || "https://integrate.api.nvidia.com/v1"
).replace(/\/$/, "");

async function nvError(res: Response): Promise<string> {
  try {
    const b = (await res.json()) as { message?: string; error?: { message?: string } };
    return b.error?.message ?? b.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function nvidiaChat({
  apiKey, model, system, prompt, maxTokens = 2048,
}: {
  apiKey: string; model: string; system?: string; prompt: string; maxTokens?: number;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(await nvError(res));
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: (data.choices?.[0]?.message?.content ?? "").trim(),
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

const g = globalThis as unknown as { __nvModels?: { at: number; ids: string[] } };
const MODELS_TTL_MS = 6 * 60 * 60 * 1000;

export async function listNvidiaModels(apiKey: string): Promise<string[]> {
  const now = Date.now();
  if (g.__nvModels && now - g.__nvModels.at < MODELS_TTL_MS) return g.__nvModels.ids;
  const res = await fetch(`${NVIDIA_BASE}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(await nvError(res));
  const data = (await res.json()) as { data?: { id: string }[] };
  const ids = (data.data ?? []).map((m) => m.id);
  g.__nvModels = { at: now, ids };
  return ids;
}
