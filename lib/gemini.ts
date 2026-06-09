// Cliente mínimo de Google AI Studio (Gemini / Generative Language API).
// Server-only. Usa la API key del conector google-ai. Fetch directo, sin SDK.
const BASE = "https://generativelanguage.googleapis.com/v1beta";
// Modelos vigentes (los 2.0 quedaron deprecados). Override por
// GOOGLE_AI_MODEL / GOOGLE_AI_IMAGE_MODEL o el campo "Modelo" del conector.
const DEFAULT_MODEL = "gemini-2.5-flash";
// gemini-2.5-flash-image-preview no existe en v1beta; el preview de imagen 2.0
// sí resuelve (la falla previa era de billing, no de modelo). Override por
// GOOGLE_AI_IMAGE_MODEL si tu cuenta tiene otro.
const DEFAULT_IMAGE_MODEL = "gemini-2.0-flash-preview-image-generation";

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

import { lookup } from "node:dns/promises";
import net from "node:net";

// ¿La IP es privada/loopback/link-local/ULA/no-ruteable? (anti-SSRF)
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true; // unspecified / 10/8 / loopback
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    return false;
  }
  const l = ip.toLowerCase();
  if (l === "::1" || l === "::") return true; // loopback / unspecified
  if (l.startsWith("fe80")) return true; // link-local fe80::/10
  if (l.startsWith("fc") || l.startsWith("fd")) return true; // ULA fc00::/7
  const m = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (m) return isPrivateIp(m[1]);
  return false;
}

// Solo permite http(s) hacia hosts que resuelven a direcciones públicas.
// Mitiga SSRF: la URL la aporta un editor autenticado, pero igual evitamos
// que el server golpee metadata cloud / servicios internos.
async function isSafePublicUrl(src: string): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(src);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  try {
    const addrs = await lookup(u.hostname, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

// Descarga una imagen (URL pública o data: URL) y la devuelve como inlineData
// para Gemini. Devuelve null si falla o excede el tope de tamaño.
const MAX_IMG_BYTES = 5_000_000;
async function fetchInlineImage(
  src: string,
): Promise<{ mimeType: string; data: string } | null> {
  try {
    if (src.startsWith("data:")) {
      const m = src.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) return null;
      return { mimeType: m[1], data: m[2] };
    }
    if (!(await isSafePublicUrl(src))) return null;
    // redirect: "manual" → no seguimos 3xx (un redirect podría apuntar a una IP
    // interna y saltarse la validación de arriba).
    const res = await fetch(src, { redirect: "manual" });
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
    if (!mimeType.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_IMG_BYTES) return null;
    return { mimeType, data: buf.toString("base64") };
  } catch {
    return null;
  }
}

// Analiza imágenes de referencia con Gemini (multimodal) y devuelve una
// descripción textual: estilo, paleta, composición, elementos, tono. Pensado
// para alimentar el contexto de los modelos de texto (que no "ven" imágenes).
// Devuelve "" si no hay imágenes legibles.
export async function analyzeImagesGemini({
  apiKey,
  images,
  instruction,
  model,
  maxTokens = 1024,
}: {
  apiKey: string;
  images: string[];
  instruction?: string;
  model?: string;
  maxTokens?: number;
}): Promise<string> {
  const inlined = (await Promise.all(images.slice(0, 6).map(fetchInlineImage))).filter(
    (x): x is { mimeType: string; data: string } => x !== null,
  );
  if (!inlined.length) return "";

  const mdl = model || process.env.GOOGLE_AI_MODEL || DEFAULT_MODEL;
  const text =
    instruction ??
    "Describí estas imágenes de referencia para guiar la creación de avisos: " +
      "estilo visual, paleta de colores, composición, elementos/objetos, texto visible, " +
      "tono/emoción y cualquier detalle de marca. Sé concreto y conciso (máx 120 palabras por imagen).";

  const res = await fetch(
    `${BASE}/models/${mdl}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text },
              ...inlined.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
            ],
          },
        ],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4 },
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
  return (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
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
