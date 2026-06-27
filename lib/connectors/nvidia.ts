// lib/connectors/nvidia.ts
// Conector de análisis: NVIDIA NIM (categoría `analysis`). Proveedor primario de
// generación de texto asistida (redacción, NL→segmento, etc.) vía lib/ai/generate.
// Sin NVIDIA_API_KEY, el dispatcher cae a Gemini/Claude/SiliconFlow/heurística.
import type {
  AnalysisConnector, AnalysisResult, AnalysisTask, Config, ConnectorStatus, Quota, TestResult,
} from "./types";
import { getUsage, nextMonthlyReset } from "@/lib/quota";
import { DEFAULT_PROJECT_ID } from "@/lib/projects";
import { getConnectorConfig } from "./config";
import { nvidiaChat } from "@/lib/nvidia";

const ID = "nvidia";
export const NVIDIA_DEFAULT_FAST = "meta/llama-3.3-70b-instruct";
export const NVIDIA_DEFAULT_DEEP = "nvidia/llama-3.1-nemotron-ultra-253b-v1";
export const NVIDIA_TOKEN_CAP = 5_000_000;

export const nvidiaConnector: AnalysisConnector = {
  id: ID,
  name: "NVIDIA NIM",
  vendor: "NVIDIA",
  category: "analysis",
  description: "Generación de texto asistida (proveedor primario, 121 modelos).",
  docsUrl: "https://docs.api.nvidia.com",
  iconEmoji: "🟩",
  capabilities: [
    { id: "analysis.text_generation", label: "Generación de texto" },
    { id: "analysis.coding_qualitative", label: "Coding inductivo" },
  ],
  configSchema: [
    { key: "NVIDIA_API_KEY", label: "API Key", type: "secret", required: true, placeholder: "nvapi-…" },
    {
      key: "NVIDIA_MODEL_FAST", label: "Modelo rápido", type: "select", required: false,
      placeholder: NVIDIA_DEFAULT_FAST,
      help: "Modelo barato para redacción/segmento. Default: " + NVIDIA_DEFAULT_FAST,
    },
    {
      key: "NVIDIA_MODEL_DEEP", label: "Modelo profundo", type: "select", required: false,
      placeholder: NVIDIA_DEFAULT_DEEP,
      help: "Modelo grande para resúmenes/análisis. Default: " + NVIDIA_DEFAULT_DEEP,
    },
  ],

  async test(config?: Config): Promise<TestResult> {
    const cfg = config ?? (await getConnectorConfig(ID));
    if (!cfg.NVIDIA_API_KEY) {
      return { ok: true, message: "Sin key — el asistente usa fallback (Gemini/Claude/heurística)." };
    }
    const model = cfg.NVIDIA_MODEL_FAST || NVIDIA_DEFAULT_FAST;
    try {
      await nvidiaChat({ apiKey: cfg.NVIDIA_API_KEY, model, prompt: "Reply with exactly: OK", maxTokens: 8 });
      return { ok: true, message: `Conecta — modelo ${model}.` };
    } catch (e) {
      return { ok: false, message: `Error: ${(e as Error).message}` };
    }
  },

  async getStatus(): Promise<ConnectorStatus> {
    return (await getUsage(ID)) >= NVIDIA_TOKEN_CAP ? "quota_exhausted" : "enabled";
  },

  async getQuota(projectId: string = DEFAULT_PROJECT_ID): Promise<Quota> {
    return {
      used: await getUsage(ID, projectId),
      limit: NVIDIA_TOKEN_CAP, unit: "tokens", period: "month", resetAt: nextMonthlyReset(),
    };
  },

  // El coding/sentiment real corre por el dispatcher (lib/ai/generate). Acá
  // mantenemos el contrato AnalysisConnector con un passthrough mínimo.
  async analyze(input: string | string[], task: AnalysisTask): Promise<AnalysisResult> {
    return { task, output: Array.isArray(input) ? input : [input] };
  },
};
