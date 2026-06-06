// Conector analysis: Google AI Studio (Gemini). Generación de contenido para
// publicaciones y avisos. Sin GOOGLE_AI_API_KEY corre en modo mock.
import type {
  Config,
  ConnectorStatus,
  TestResult,
  Connector,
} from "./types";
import { getConnectorConfig } from "./config";

const ID = "google-ai";

export const googleAiConnector: Connector = {
  id: ID,
  name: "Google AI Studio (Gemini)",
  vendor: "Google",
  category: "analysis",
  description:
    "Genera texto para publicaciones y avisos con Gemini, con ajustes acumulativos.",
  docsUrl: "https://ai.google.dev/gemini-api/docs",
  iconEmoji: "🌟",

  capabilities: [
    { id: "google_ai.generate_text", label: "Generar contenido (Gemini)" },
  ],

  configSchema: [
    {
      key: "GOOGLE_AI_API_KEY",
      label: "API Key",
      type: "secret",
      required: true,
      placeholder: "AIza…",
      help: "Clave de Google AI Studio (aistudio.google.com/app/apikey).",
    },
    {
      key: "GOOGLE_AI_MODEL",
      label: "Modelo",
      type: "text",
      required: false,
      placeholder: "gemini-2.0-flash",
      help: "Opcional. Por defecto gemini-2.0-flash.",
    },
  ],

  async test(config?: Config): Promise<TestResult> {
    const cfg = config ?? (await getConnectorConfig(ID));
    if (!cfg.GOOGLE_AI_API_KEY) {
      return { ok: true, message: "Modo mock — sin GOOGLE_AI_API_KEY configurada." };
    }
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
          cfg.GOOGLE_AI_API_KEY,
        )}`,
      );
      if (!res.ok) {
        return { ok: false, message: `Google AI error: HTTP ${res.status}` };
      }
      return { ok: true, message: "API key válida — generación con Gemini." };
    } catch (err) {
      return { ok: false, message: `Error conectando a Google AI: ${(err as Error).message}` };
    }
  },

  async getStatus(config?: Config): Promise<ConnectorStatus> {
    const cfg = config ?? (await getConnectorConfig(ID));
    return cfg.GOOGLE_AI_API_KEY ? "enabled" : "configuring";
  },
};
