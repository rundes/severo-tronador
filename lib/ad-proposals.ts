// Generación de propuestas de avisos para redes con MÚLTIPLES modelos de IA.
// Un mismo prompt se manda a todos los proveedores/modelos configurados
// (SiliconFlow + Gemini + Claude) y cada uno devuelve una propuesta con
// contenido para cada plataforma elegida. Server-only.
import { getConnectorConfig } from "@/lib/connectors/config";
import { generateText } from "@/lib/anthropic";
import { generateGeminiText, analyzeImagesGemini } from "@/lib/gemini";
import { siliconflowChat, siliconflowModels } from "@/lib/siliconflow";

export type Platform =
  | "instagram"
  | "facebook"
  | "whatsapp"
  | "x"
  | "tiktok"
  | "youtube";

export const PLATFORMS: { id: Platform; label: string; guide: string }[] = [
  { id: "instagram", label: "Instagram", guide: "caption (feed con saltos y hasta 5 hashtags), reel (idea/guion 15-30s), story (texto corto)" },
  { id: "facebook", label: "Facebook", guide: "post (texto), headline (título corto)" },
  { id: "whatsapp", label: "WhatsApp", guide: "broadcast (mensaje breve y directo para difusión)" },
  { id: "x", label: "X", guide: "tweet (máximo 280 caracteres), thread (array de tweets, opcional)" },
  { id: "tiktok", label: "TikTok", guide: "hook (primeros 3s), script (guion), caption" },
  { id: "youtube", label: "YouTube", guide: "title, description, short_script (guion para un Short)" },
];

const PLATFORM_IDS = PLATFORMS.map((p) => p.id);

export interface Proposal {
  id: string;
  provider: string; // siliconflow | gemini | claude
  modelName: string; // id real del modelo (para refinar con el mismo)
  label: string; // nombre legible
  angle: string; // ángulo creativo en una frase
  platforms: Record<string, Record<string, string | string[]>>;
}

// Materiales de referencia que el usuario adjunta al brief (links de notas,
// imágenes y videos de inspiración). Se inyectan como contexto en el prompt
// para que los modelos los tengan presentes al generar/afinar.
export interface BriefRefs {
  links: string[];
  images: string[];
  videos: string[];
}

// Bloque de texto con las referencias, anexado al prompt del usuario. Los
// modelos de texto no "ven" las imágenes/videos: reciben las URLs como
// contexto para alinear tono/estilo y, si pueden, citarlas.
export function refsBlock(refs?: BriefRefs): string {
  if (!refs) return "";
  const parts: string[] = [];
  if (refs.links?.length)
    parts.push("Links de referencia (notas/fuentes a considerar):\n" + refs.links.map((l) => `- ${l}`).join("\n"));
  if (refs.images?.length)
    parts.push("Imágenes de referencia (inspiración visual / estilo):\n" + refs.images.map((l) => `- ${l}`).join("\n"));
  if (refs.videos?.length)
    parts.push("Videos de referencia (tono / formato):\n" + refs.videos.map((l) => `- ${l}`).join("\n"));
  if (!parts.length) return "";
  return "\n\n--- Materiales de referencia aportados ---\n" + parts.join("\n\n") + "\n--- fin de referencias ---";
}

// Cache en memoria (por instancia del server) de descripción por URL de imagen,
// para no re-analizar la misma imagen en cada generación/afinado.
const imageDescCache = new Map<string, string>();

// Analiza las imágenes de referencia con Gemini (visión) y devuelve un bloque
// con lo que muestran, para que TODOS los modelos del fan-out (incluidos los
// que no son multimodales) tengan ese contexto. Sin Gemini configurado → "".
async function describeBriefImages(images: string[]): Promise<string> {
  if (!images.length) return "";
  const cfg = await getConnectorConfig("google-ai");
  const apiKey = cfg.GOOGLE_AI_API_KEY;
  if (!apiKey) return "";
  const uncached = images.filter((u) => !imageDescCache.has(u));
  if (uncached.length) {
    await Promise.all(
      uncached.map(async (url) => {
        try {
          const desc = await analyzeImagesGemini({ apiKey, images: [url] });
          if (desc) imageDescCache.set(url, desc);
        } catch {
          // si falla la visión para una imagen, seguimos sin su descripción
        }
      }),
    );
  }
  const lines = images
    .map((u, i) => {
      const d = imageDescCache.get(u);
      return d ? `Imagen ${i + 1}: ${d}` : "";
    })
    .filter(Boolean);
  return lines.length
    ? "\n\nAnálisis de las imágenes de referencia (lo que muestran, para alinear el contenido):\n" +
        lines.join("\n")
    : "";
}

interface ModelRef {
  provider: string;
  modelName: string;
  label: string;
  key: string;
}

// Modelos disponibles según conectores configurados (las keys NO salen al
// cliente: solo se usan acá para llamar a cada proveedor).
export async function availableModels(): Promise<Omit<ModelRef, "key">[]> {
  return (await modelRefs()).map((r) => ({
    provider: r.provider,
    modelName: r.modelName,
    label: r.label,
  }));
}

async function modelRefs(): Promise<ModelRef[]> {
  const out: ModelRef[] = [];
  const sf = await getConnectorConfig("siliconflow");
  if (sf.SILICONFLOW_API_KEY) {
    for (const m of siliconflowModels(sf.SILICONFLOW_MODELS)) {
      out.push({ provider: "siliconflow", modelName: m, label: m.split("/").pop() ?? m, key: sf.SILICONFLOW_API_KEY });
    }
  }
  const g = await getConnectorConfig("google-ai");
  if (g.GOOGLE_AI_API_KEY) {
    out.push({ provider: "gemini", modelName: g.GOOGLE_AI_MODEL || "gemini-2.5-flash", label: "Gemini", key: g.GOOGLE_AI_API_KEY });
  }
  const c = await getConnectorConfig("claude-api");
  if (c.ANTHROPIC_API_KEY) {
    out.push({ provider: "claude", modelName: c.ANTHROPIC_MODEL || "claude-sonnet-4-6", label: "Claude", key: c.ANTHROPIC_API_KEY });
  }
  return out;
}

async function callModel(ref: ModelRef, system: string, prompt: string): Promise<string> {
  if (ref.provider === "claude") {
    return (await generateText({ apiKey: ref.key, system, prompt, maxTokens: 2048, model: ref.modelName })).text;
  }
  if (ref.provider === "gemini") {
    return (await generateGeminiText({ apiKey: ref.key, system, prompt })).text;
  }
  return siliconflowChat({ apiKey: ref.key, model: ref.modelName, system, prompt });
}

function buildSystem(platforms: Platform[]): string {
  const sel = PLATFORMS.filter((p) => platforms.includes(p.id));
  const guide = sel.map((p) => `- ${p.id}: ${p.guide}`).join("\n");
  return [
    "Sos un creativo publicitario para una organización de relevamiento de",
    "opinión pública (no es campaña electoral). Generás UNA propuesta de aviso.",
    "Devolvé SOLO JSON válido, sin markdown ni explicaciones, con esta forma:",
    '{ "angle": "ángulo creativo en una frase", "platforms": { "<plataforma>": { <campos> } } }',
    "Incluí EXACTAMENTE estas plataformas y sus campos:",
    guide,
    "Español rioplatense, claro y respetuoso. Adaptá tono y longitud a cada",
    "plataforma. Los hashtags como array de strings. No inventes datos ni cifras.",
  ].join("\n");
}

function parseProposal(text: string): { angle: string; platforms: Proposal["platforms"] } {
  const s = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    const o = JSON.parse(s) as { angle?: unknown; platforms?: unknown };
    const platforms: Proposal["platforms"] = {};
    if (o.platforms && typeof o.platforms === "object") {
      for (const [k, v] of Object.entries(o.platforms as Record<string, unknown>)) {
        if (PLATFORM_IDS.includes(k as Platform) && v && typeof v === "object") {
          platforms[k] = v as Record<string, string | string[]>;
        }
      }
    }
    return { angle: typeof o.angle === "string" ? o.angle : "", platforms };
  } catch {
    // Si el modelo no devolvió JSON, guardamos el texto crudo como general.
    return { angle: "", platforms: { general: { texto: s } } };
  }
}

export async function generateProposals(
  prompt: string,
  platforms: Platform[],
  brief?: BriefRefs,
): Promise<Proposal[]> {
  const refs = await modelRefs();
  if (refs.length === 0) {
    throw new Error(
      "No hay proveedores de IA configurados. Cargá SiliconFlow, Google AI o Claude en Conectores.",
    );
  }
  const system = buildSystem(platforms);
  const imgAnalysis = await describeBriefImages(brief?.images ?? []);
  const fullPrompt = prompt + refsBlock(brief) + imgAnalysis;
  const results = await Promise.all(
    refs.map(async (ref, i) => {
      try {
        const txt = await callModel(ref, system, fullPrompt);
        const { angle, platforms: pf } = parseProposal(txt);
        return {
          id: `${ref.provider}-${i}`,
          provider: ref.provider,
          modelName: ref.modelName,
          label: ref.label,
          angle,
          platforms: pf,
        } as Proposal;
      } catch {
        return null;
      }
    }),
  );
  return results.filter((r): r is Proposal => r !== null);
}

export async function refineProposal(
  base: Proposal,
  refinePrompt: string,
  platforms: Platform[],
  brief?: BriefRefs,
): Promise<Proposal> {
  const refs = await modelRefs();
  const ref =
    refs.find((r) => r.provider === base.provider && r.modelName === base.modelName) ??
    refs.find((r) => r.provider === base.provider) ??
    refs[0];
  if (!ref) throw new Error("No hay proveedores de IA configurados.");
  const system = buildSystem(platforms);
  const imgAnalysis = await describeBriefImages(brief?.images ?? []);
  const userPrompt = [
    "Propuesta actual (JSON):",
    JSON.stringify({ angle: base.angle, platforms: base.platforms }),
    "",
    "Ajustala según esta indicación, manteniendo lo bueno:",
    refinePrompt,
    refsBlock(brief),
    imgAnalysis,
  ].join("\n");
  const txt = await callModel(ref, system, userPrompt);
  const { angle, platforms: pf } = parseProposal(txt);
  return { ...base, angle: angle || base.angle, platforms: Object.keys(pf).length ? pf : base.platforms };
}
