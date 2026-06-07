// Conector analysis: SiliconFlow (acceso a múltiples modelos de IA via API
// OpenAI-compatible). Genera propuestas de avisos con varios modelos a la vez.
import type { Config, ConnectorStatus, TestResult, Connector } from "./types";
import { getConnectorConfig } from "./config";

const ID = "siliconflow";

export const siliconflowConnector: Connector = {
  id: ID,
  name: "SiliconFlow",
  vendor: "SiliconFlow",
  category: "analysis",
  description: "Acceso a múltiples modelos de IA para generar propuestas de avisos.",
  docsUrl: "https://docs.siliconflow.cn",
  iconEmoji: "🧩",

  capabilities: [{ id: "siliconflow.generate_text", label: "Generar con varios modelos" }],

  configSchema: [
    {
      key: "SILICONFLOW_API_KEY",
      label: "API Key",
      type: "secret",
      required: true,
      placeholder: "sk-…",
      help: "Clave de siliconflow.com.",
    },
    {
      key: "SILICONFLOW_MODELS",
      label: "Modelos de texto (coma)",
      type: "text",
      required: false,
      placeholder: "Qwen/Qwen2.5-72B-Instruct, deepseek-ai/DeepSeek-V3",
      help: "Opcional. Lista de modelos de chat para el estudio. Por defecto, un set curado.",
    },
    {
      key: "SILICONFLOW_IMAGE_MODEL",
      label: "Modelo de imagen",
      type: "text",
      required: false,
      placeholder: "black-forest-labs/FLUX.1-schnell",
      help: "Opcional. Modelo text-to-image habilitado en tu cuenta.",
    },
    {
      key: "SILICONFLOW_VIDEO_MODEL",
      label: "Modelo de video",
      type: "text",
      required: false,
      placeholder: "Wan-AI/Wan2.2-T2V-A14B (text-to-video)",
      help: "Opcional. Modelo text-to-video HABILITADO en tu cuenta de SiliconFlow (si da 'Model disabled', activalo en cloud.siliconflow.com o usá otro).",
    },
  ],

  async test(config?: Config): Promise<TestResult> {
    const cfg = config ?? (await getConnectorConfig(ID));
    return cfg.SILICONFLOW_API_KEY
      ? { ok: true, message: "API key presente — generación con múltiples modelos." }
      : { ok: true, message: "Modo mock — sin SILICONFLOW_API_KEY." };
  },

  async getStatus(config?: Config): Promise<ConnectorStatus> {
    const cfg = config ?? (await getConnectorConfig(ID));
    return cfg.SILICONFLOW_API_KEY ? "enabled" : "configuring";
  },
};
