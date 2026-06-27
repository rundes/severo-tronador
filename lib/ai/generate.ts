// lib/ai/generate.ts
// Dispatcher único de generación de texto asistida. Orden de proveedor:
// NVIDIA → Gemini → Claude → SiliconFlow → heurística (fallback del caller).
// Centraliza la elección de proveedor/modelo y el tracking de tokens por proyecto.
import { getConnectorConfig } from "@/lib/connectors/config";
import { incrementUsage } from "@/lib/quota";
import { nvidiaChat } from "@/lib/nvidia";
import { generateGeminiText } from "@/lib/gemini";
import { generateText } from "@/lib/anthropic";
import { siliconflowChat, siliconflowModels } from "@/lib/siliconflow";
import { NVIDIA_DEFAULT_FAST, NVIDIA_DEFAULT_DEEP } from "@/lib/connectors/nvidia";

export type AssistTier = "fast" | "deep";

export interface AssistInput {
  system?: string;
  prompt: string;
  tier?: AssistTier;
  projectId: string;
  maxTokens?: number;
  // Texto de respaldo (heurística local del caller) si ningún proveedor responde.
  fallback?: string;
}
export interface AssistResult { text: string; provider: string; model: string; }

const approx = (a: string, b: string) => Math.ceil((a.length + b.length) / 4);

export async function generateAssist(input: AssistInput): Promise<AssistResult> {
  const { system, prompt, tier = "fast", projectId, maxTokens } = input;

  // 1) NVIDIA
  const nv = await getConnectorConfig("nvidia");
  if (nv.NVIDIA_API_KEY) {
    const model =
      tier === "deep"
        ? nv.NVIDIA_MODEL_DEEP || NVIDIA_DEFAULT_DEEP
        : nv.NVIDIA_MODEL_FAST || NVIDIA_DEFAULT_FAST;
    try {
      const r = await nvidiaChat({ apiKey: nv.NVIDIA_API_KEY, model, system, prompt, maxTokens });
      if (r.text) {
        await incrementUsage("nvidia", r.inputTokens + r.outputTokens || approx(prompt, r.text), projectId);
        return { text: r.text, provider: "nvidia", model };
      }
    } catch { /* cae al siguiente */ }
  }

  // 2) Gemini
  const g = await getConnectorConfig("google-ai");
  if (g.GOOGLE_AI_API_KEY) {
    try {
      const r = await generateGeminiText({ apiKey: g.GOOGLE_AI_API_KEY, system, prompt, maxTokens });
      if (r.text) {
        await incrementUsage("google-ai", approx(prompt, r.text), projectId);
        return { text: r.text, provider: "google-ai", model: g.GOOGLE_AI_MODEL || "gemini-2.5-flash" };
      }
    } catch { /* cae */ }
  }

  // 3) Claude
  const c = await getConnectorConfig("claude-api");
  if (c.ANTHROPIC_API_KEY) {
    try {
      const model = c.ANTHROPIC_MODEL || "claude-sonnet-4-6";
      const r = await generateText({ apiKey: c.ANTHROPIC_API_KEY, system, prompt, model, maxTokens });
      if (r.text) {
        await incrementUsage("claude-api", r.inputTokens + r.outputTokens, projectId);
        return { text: r.text, provider: "claude-api", model };
      }
    } catch { /* cae */ }
  }

  // 4) SiliconFlow
  const sf = await getConnectorConfig("siliconflow");
  if (sf.SILICONFLOW_API_KEY) {
    try {
      const model = siliconflowModels(sf.SILICONFLOW_MODELS)[0];
      const text = await siliconflowChat({ apiKey: sf.SILICONFLOW_API_KEY, model, system, prompt, maxTokens });
      if (text) {
        await incrementUsage("siliconflow", approx(prompt, text), projectId);
        return { text, provider: "siliconflow", model };
      }
    } catch { /* cae */ }
  }

  // 5) Heurística del caller
  if (input.fallback !== undefined) {
    return { text: input.fallback, provider: "heuristic", model: "local" };
  }
  throw new Error("No hay proveedor de IA configurado. Cargá NVIDIA, Gemini o Claude en Conectores.");
}
