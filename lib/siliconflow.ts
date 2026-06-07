// Cliente de SiliconFlow (API OpenAI-compatible que hostea muchos modelos:
// Qwen, DeepSeek, GLM, Llama, FLUX, video, etc.). Server-only. Usa la key del
// conector siliconflow. Fetch directo.
// La plataforma tiene dos regiones con keys distintas: .com (internacional) y
// .cn (China). Default .com; override con SILICONFLOW_BASE si tu key es de .cn.
const BASE = (process.env.SILICONFLOW_BASE || "https://api.siliconflow.com/v1").replace(/\/$/, "");
const URL = `${BASE}/chat/completions`;

// Modelos de imagen y video por defecto (override con env).
const DEFAULT_IMAGE_MODEL = "black-forest-labs/FLUX.1-schnell";
const DEFAULT_VIDEO_MODEL = "Wan-AI/Wan2.2-T2V-A14B";

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

async function sfError(res: Response): Promise<string> {
  try {
    const b = (await res.json()) as { message?: string; error?: { message?: string } };
    return b.error?.message ?? b.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

// Genera una imagen (text-to-image). Devuelve la URL temporal de SiliconFlow.
export async function siliconflowImage({
  apiKey,
  prompt,
  model,
  size = "1024x1024",
}: {
  apiKey: string;
  prompt: string;
  model?: string;
  size?: string;
}): Promise<string> {
  const res = await fetch(`${BASE}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model || process.env.SILICONFLOW_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
      prompt,
      image_size: size,
    }),
  });
  if (!res.ok) throw new Error(await sfError(res));
  const data = (await res.json()) as {
    images?: { url?: string }[];
    data?: { url?: string }[];
  };
  const url = data.images?.[0]?.url ?? data.data?.[0]?.url;
  if (!url) throw new Error("SiliconFlow no devolvió imagen.");
  return url;
}

// Envía un job de video (text-to-video). Devuelve el requestId para consultar.
export async function siliconflowVideoSubmit({
  apiKey,
  prompt,
  model,
}: {
  apiKey: string;
  prompt: string;
  model?: string;
}): Promise<string> {
  const res = await fetch(`${BASE}/video/submit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model || process.env.SILICONFLOW_VIDEO_MODEL || DEFAULT_VIDEO_MODEL,
      prompt,
    }),
  });
  if (!res.ok) throw new Error(await sfError(res));
  const data = (await res.json()) as { requestId?: string; request_id?: string };
  const id = data.requestId ?? data.request_id;
  if (!id) throw new Error("SiliconFlow no devolvió requestId de video.");
  return id;
}

export interface VideoStatus {
  status: "pending" | "ready" | "failed";
  url?: string;
  reason?: string;
}

// Consulta el estado de un job de video.
export async function siliconflowVideoStatus({
  apiKey,
  requestId,
}: {
  apiKey: string;
  requestId: string;
}): Promise<VideoStatus> {
  const res = await fetch(`${BASE}/video/status`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requestId }),
  });
  if (!res.ok) throw new Error(await sfError(res));
  const data = (await res.json()) as {
    status?: string;
    reason?: string;
    results?: { videos?: { url?: string }[] };
  };
  const url = data.results?.videos?.[0]?.url;
  const raw = (data.status ?? "").toLowerCase();
  if (url || raw === "succeed" || raw === "success" || raw === "completed") {
    return { status: "ready", url };
  }
  if (raw === "failed" || raw === "error") return { status: "failed", reason: data.reason };
  return { status: "pending" };
}
