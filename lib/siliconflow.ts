// Cliente de SiliconFlow (API OpenAI-compatible que hostea muchos modelos:
// Qwen, DeepSeek, GLM, Llama, etc.). Server-only. Usa la key del conector
// siliconflow. Fetch directo a /v1/chat/completions.
const URL = "https://api.siliconflow.cn/v1/chat/completions";

// Modelos por defecto (curados). Override con SILICONFLOW_MODELS (coma).
const DEFAULT_MODELS = [
  "Qwen/Qwen2.5-72B-Instruct",
  "deepseek-ai/DeepSeek-V3",
  "THUDM/glm-4-9b-chat",
  "meta-llama/Llama-3.3-70B-Instruct",
];

export function siliconflowModels(cfgList?: string): string[] {
  if (cfgList && cfgList.trim()) {
    return cfgList
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return DEFAULT_MODELS;
}

export async function siliconflowChat({
  apiKey,
  model,
  system,
  prompt,
  maxTokens = 2048,
}: {
  apiKey: string;
  model: string;
  system?: string;
  prompt: string;
  maxTokens?: number;
}): Promise<string> {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.9,
    }),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const b = (await res.json()) as { message?: string; error?: { message?: string } };
      detail = b.error?.message ?? b.message ?? detail;
    } catch {
      // sin JSON
    }
    throw new Error(detail);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return (data.choices?.[0]?.message?.content ?? "").trim();
}
