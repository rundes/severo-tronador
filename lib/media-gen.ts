// Generación de medios (imagen + video) para las propuestas del estudio.
// Imagen: Gemini (Google AI) o SiliconFlow FLUX. Video: SiliconFlow (async).
// Las imágenes se re-suben a Storage para tener URL pública y estable.
import { randomUUID } from "crypto";
import { getConnectorConfig } from "@/lib/connectors/config";
import { getSupabase, dbConfigured } from "@/lib/db/supabase";
import { generateGeminiImage } from "@/lib/gemini";
import {
  siliconflowImage,
  siliconflowVideoSubmit,
  siliconflowVideoStatus,
  type VideoStatus,
} from "@/lib/siliconflow";

const BUCKET = "encuesta-img";

async function ensureBucket() {
  if (!dbConfigured()) return;
  await getSupabase()
    .storage.createBucket(BUCKET, { public: true, allowedMimeTypes: ["image/png", "image/jpeg"] })
    .catch(() => undefined);
}

async function uploadBytes(projectId: string, bytes: Uint8Array, mime: string): Promise<string> {
  await ensureBucket();
  const ext = mime.includes("jpeg") ? "jpg" : "png";
  const path = `${projectId}/media-${randomUUID()}.${ext}`;
  const sb = getSupabase();
  const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (up.error) throw new Error(up.error.message);
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function persistRemote(projectId: string, srcUrl: string): Promise<string> {
  // Re-sube una imagen remota (URL temporal de SiliconFlow) a Storage.
  if (!dbConfigured()) return srcUrl;
  const r = await fetch(srcUrl);
  if (!r.ok) return srcUrl;
  const mime = r.headers.get("content-type") ?? "image/png";
  const bytes = new Uint8Array(await r.arrayBuffer());
  return uploadBytes(projectId, bytes, mime.includes("jpeg") ? "image/jpeg" : "image/png");
}

export interface MediaResult {
  ok: boolean;
  url?: string;
  msg: string;
}

// Genera una imagen para una propuesta. Prefiere Gemini; si no, SiliconFlow.
export async function generateProposalImage(
  projectId: string,
  prompt: string,
): Promise<MediaResult> {
  const g = await getConnectorConfig("google-ai");
  if (g.GOOGLE_AI_API_KEY) {
    try {
      const img = await generateGeminiImage({ apiKey: g.GOOGLE_AI_API_KEY, prompt });
      if (!dbConfigured()) return { ok: true, url: `data:${img.mime};base64,${img.base64}`, msg: "Imagen (local)." };
      const url = await uploadBytes(projectId, Buffer.from(img.base64, "base64"), img.mime);
      return { ok: true, url, msg: "Imagen generada con Gemini." };
    } catch {
      // cae a SiliconFlow
    }
  }
  const sf = await getConnectorConfig("siliconflow");
  if (sf.SILICONFLOW_API_KEY) {
    try {
      const tmp = await siliconflowImage({ apiKey: sf.SILICONFLOW_API_KEY, prompt });
      const url = await persistRemote(projectId, tmp);
      return { ok: true, url, msg: "Imagen generada con SiliconFlow." };
    } catch (e) {
      return { ok: false, msg: `SiliconFlow: ${(e as Error).message}` };
    }
  }
  return { ok: false, msg: "Configurá Google AI o SiliconFlow para generar imágenes." };
}

export interface VideoSubmitResult {
  ok: boolean;
  requestId?: string;
  msg: string;
}

// Envía un job de video (SiliconFlow). Devuelve requestId para consultar.
export async function submitProposalVideo(prompt: string): Promise<VideoSubmitResult> {
  const sf = await getConnectorConfig("siliconflow");
  if (!sf.SILICONFLOW_API_KEY) {
    return { ok: false, msg: "El video requiere SiliconFlow. Cargá su API key en Conectores." };
  }
  try {
    const requestId = await siliconflowVideoSubmit({ apiKey: sf.SILICONFLOW_API_KEY, prompt });
    return { ok: true, requestId, msg: "Video en proceso. Puede tardar unos minutos." };
  } catch (e) {
    return { ok: false, msg: `SiliconFlow: ${(e as Error).message}` };
  }
}

export async function checkProposalVideo(requestId: string): Promise<VideoStatus & { ok: boolean }> {
  const sf = await getConnectorConfig("siliconflow");
  if (!sf.SILICONFLOW_API_KEY) return { ok: false, status: "failed", reason: "Sin SiliconFlow." };
  try {
    const s = await siliconflowVideoStatus({ apiKey: sf.SILICONFLOW_API_KEY, requestId });
    return { ok: true, ...s };
  } catch (e) {
    return { ok: false, status: "failed", reason: (e as Error).message };
  }
}
