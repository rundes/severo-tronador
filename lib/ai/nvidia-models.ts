// lib/ai/nvidia-models.ts
// Clasificador estático de los modelos de NVIDIA NIM por capacidad. La API no
// tipa los modelos (solo id/owned_by), así que clasificamos por patrón de id.
import { listNvidiaModels } from "@/lib/nvidia";

export type ModelCapability =
  | "text" | "code" | "vision" | "embedding" | "rerank" | "safety" | "translate" | "other";

export interface NvidiaModel { id: string; capability: ModelCapability; label: string; }

export const PICKER_CAPS: ModelCapability[] = ["text", "code", "vision"];

// Orden importa: safety y embedding se chequean antes que text para no
// clasificar "nemoguard...instruct" o "...embed...instruct" como text.
export function classify(id: string): ModelCapability {
  const s = id.toLowerCase();
  if (/guard|content-safety|topic-control|safety|reward|nemoguard|gliner-pii/.test(s)) return "safety";
  if (/embed|bge-|arctic-embed|nvclip/.test(s)) return "embedding";
  if (/rerank|reranker/.test(s)) return "rerank";
  if (/riva-translate/.test(s)) return "translate";
  if (/vision|-vl-|vila|neva|deplot|fuyu|kosmos|paligemma|nemoretriever-parse|nemotron-parse|nemoretriever|cosmos-reason|omni|multimodal/.test(s)) return "vision";
  if (/code|codestral|codegemma|starcoder|granite-\d+b-code|embedcode|dracarys/.test(s)) return "code";
  if (/instruct|chat|nemotron|mistral|mixtral|qwen|gemma|phi-|llama|deepseek|glm|jamba|yi-|solar|palmyra|minimax|kimi|step-|sarvam|zamba|granite|dbrx|seed-oss|stockmark/.test(s)) return "text";
  return "other";
}

export async function curatedModels(apiKey: string): Promise<NvidiaModel[]> {
  const ids = await listNvidiaModels(apiKey);
  return ids
    .map((id) => ({ id, capability: classify(id), label: id.split("/").pop() ?? id }))
    .filter((m) => PICKER_CAPS.includes(m.capability))
    .sort((a, b) => a.id.localeCompare(b.id));
}
