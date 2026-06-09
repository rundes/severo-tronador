"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { requireMember } from "@/lib/workspace";
import { logAudit } from "@/lib/audit";
import {
  publishToPage,
  publishToInstagram,
  promotePagePost,
} from "@/lib/meta";
import { getConnectorConfig } from "@/lib/connectors/config";
import { generateGeminiText, generateGeminiImage } from "@/lib/gemini";
import { generateText } from "@/lib/anthropic";
import { incrementUsage } from "@/lib/quota";
import { getSupabase, dbConfigured } from "@/lib/db/supabase";
import { randomUUID } from "crypto";
import {
  generateProposals,
  refineProposal,
  PLATFORMS,
  type Proposal,
  type Platform,
  type BriefRefs,
} from "@/lib/ad-proposals";
import {
  generateProposalImage,
  submitProposalVideo,
  checkProposalVideo,
} from "@/lib/media-gen";
import {
  listBriefs,
  saveBrief,
  deleteBrief,
  type SavedBrief,
  type BriefInput,
} from "@/lib/estudio-briefs";

async function actorEmail(): Promise<string | null> {
  return (await auth())?.user?.email ?? null;
}

export interface AiTextState {
  ok: boolean | null;
  text: string;
  msg: string;
}

// Genera/refina el texto de una publicación. Usa Google AI Studio (Gemini) si
// está configurado; si no, cae a Claude (claude-api). Soporta ajustes
// acumulativos: `current` es el texto actual y `prompt` la nueva indicación.
export async function generarContenidoPostIA(
  _prev: AiTextState,
  formData: FormData,
): Promise<AiTextState> {
  const { id: projectId } = await requireMember("editor");
  const prompt = String(formData.get("prompt") ?? "").trim();
  const current = String(formData.get("current") ?? "").trim();
  const red = String(formData.get("red") ?? "ambos");
  if (!prompt) return { ok: false, text: "", msg: "Escribí qué querés generar." };

  const redLabel =
    red === "facebook" ? "Facebook" : red === "instagram" ? "Instagram" : "Facebook e Instagram";
  const system = [
    "Escribís contenido para publicaciones y avisos de una organización de",
    "relevamiento de opinión pública en redes sociales (" + redLabel + ").",
    "Devolvé SOLO el texto del posteo (sin comillas, sin markdown, sin",
    "explicaciones). Español rioplatense, claro y cercano. Podés usar emojis con",
    "moderación y hasta 3 hashtags relevantes al final si aportan.",
    "No inventes datos, fechas ni cifras que no estén en la indicación.",
  ].join("\n");
  const userPrompt = current
    ? `Texto actual:\n${current}\n\nAjustá el texto según esta indicación (manteniendo lo bueno):\n${prompt}`
    : `Generá el texto del posteo según esta indicación:\n${prompt}`;

  const google = await getConnectorConfig("google-ai");
  const claude = await getConnectorConfig("claude-api");

  try {
    let text = "";
    if (google.GOOGLE_AI_API_KEY) {
      const r = await generateGeminiText({
        apiKey: google.GOOGLE_AI_API_KEY,
        system,
        prompt: userPrompt,
      });
      text = r.text;
      await incrementUsage("google-ai", Math.ceil((userPrompt.length + text.length) / 4), projectId);
    } else if (claude.ANTHROPIC_API_KEY) {
      const r = await generateText({ apiKey: claude.ANTHROPIC_API_KEY, system, prompt: userPrompt, maxTokens: 1024 });
      text = r.text;
      await incrementUsage("claude-api", r.inputTokens + r.outputTokens, projectId);
    } else {
      return {
        ok: false,
        text: "",
        msg: "Configurá Google AI Studio (Conectores → Google AI) o Claude API para generar contenido.",
      };
    }
    const clean = text.replace(/^["“']|["”']$/g, "").trim();
    if (!clean) return { ok: false, text: "", msg: "No se obtuvo texto. Probá reformular." };
    return { ok: true, text: clean, msg: google.GOOGLE_AI_API_KEY ? "Generado con Gemini." : "Generado con Claude (configurá Google AI para usar Gemini)." };
  } catch (e) {
    return { ok: false, text: "", msg: `Error al generar: ${(e as Error).message}` };
  }
}

export interface AiImageState {
  ok: boolean | null;
  url: string;
  msg: string;
}

export interface AiSuggestState {
  ok: boolean | null;
  suggestions: string[];
  improved: string;
  msg: string;
}

// Sugiere mejoras concretas para un aviso + una versión mejorada (Gemini con
// fallback a Claude). Pensado para "mejorar mi aviso".
export async function sugerirMejorasAviso(
  _prev: AiSuggestState,
  formData: FormData,
): Promise<AiSuggestState> {
  const { id: projectId } = await requireMember("editor");
  const texto = String(formData.get("texto") ?? "").trim();
  const red = String(formData.get("red") ?? "redes");
  if (!texto) return { ok: false, suggestions: [], improved: "", msg: "No hay texto para mejorar." };

  const system = [
    "Sos estratega de publicidad para una organización de relevamiento de",
    "opinión pública (neutral, NO campaña partidaria). Te dan el texto de un",
    `aviso para ${red}. Devolvé SOLO JSON válido, sin markdown:`,
    '{ "suggestions": ["mejora concreta", "..."], "improved": "versión mejorada del texto" }',
    "3 a 6 sugerencias accionables: gancho/primera línea, claridad, llamado a",
    "la acción, longitud adecuada a la red, prueba social, sacar jerga. La",
    "versión 'improved' mantiene el tono neutral y respeta las variables {{...}}.",
  ].join("\n");
  const userPrompt = `Aviso actual:\n${texto}`;

  const google = await getConnectorConfig("google-ai");
  const claude = await getConnectorConfig("claude-api");
  let raw = "";
  try {
    if (google.GOOGLE_AI_API_KEY) {
      const r = await generateGeminiText({ apiKey: google.GOOGLE_AI_API_KEY, system, prompt: userPrompt });
      raw = r.text;
      await incrementUsage("google-ai", Math.ceil((userPrompt.length + raw.length) / 4), projectId);
    } else if (claude.ANTHROPIC_API_KEY) {
      const r = await generateText({ apiKey: claude.ANTHROPIC_API_KEY, system, prompt: userPrompt, maxTokens: 1200 });
      raw = r.text;
      await incrementUsage("claude-api", r.inputTokens + r.outputTokens, projectId);
    } else {
      return { ok: false, suggestions: [], improved: "", msg: "Configurá Google AI o Claude API en Conectores." };
    }
  } catch (e) {
    return { ok: false, suggestions: [], improved: "", msg: `Error: ${(e as Error).message}` };
  }

  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try {
    const o = JSON.parse(stripped) as { suggestions?: unknown; improved?: unknown };
    const suggestions = Array.isArray(o.suggestions) ? o.suggestions.map(String).slice(0, 8) : [];
    const improved = typeof o.improved === "string" ? o.improved : "";
    if (!suggestions.length && !improved) {
      return { ok: false, suggestions: [], improved: "", msg: "No se obtuvieron sugerencias. Reintentá." };
    }
    return { ok: true, suggestions, improved, msg: "Sugerencias listas." };
  } catch {
    return { ok: true, suggestions: [stripped], improved: "", msg: "Sugerencias listas." };
  }
}

const IMG_BUCKET = "encuesta-img";

// Genera una imagen para la publicación con Gemini (Google AI Studio) y la
// sube a Storage; devuelve su URL pública. Sin Supabase devuelve un data URL
// (sirve para previsualizar en modo local/mock).
export async function generarImagenIA(
  _prev: AiImageState,
  formData: FormData,
): Promise<AiImageState> {
  const { id: projectId } = await requireMember("editor");
  const prompt = String(formData.get("prompt") ?? "").trim();
  if (!prompt) return { ok: false, url: "", msg: "Describí la imagen que querés." };

  const cfg = await getConnectorConfig("google-ai");
  if (!cfg.GOOGLE_AI_API_KEY) {
    return {
      ok: false,
      url: "",
      msg: "Configurá Google AI Studio (Conectores → Google AI) para generar imágenes.",
    };
  }

  try {
    const img = await generateGeminiImage({ apiKey: cfg.GOOGLE_AI_API_KEY, prompt });
    await incrementUsage("google-ai", 1000, projectId);

    if (!dbConfigured()) {
      return { ok: true, url: `data:${img.mime};base64,${img.base64}`, msg: "Imagen generada (local)." };
    }
    const sb = getSupabase();
    // Asegura el bucket (idempotente).
    await sb.storage
      .createBucket(IMG_BUCKET, { public: true, allowedMimeTypes: ["image/png", "image/jpeg"] })
      .catch(() => undefined);
    const ext = img.mime.includes("jpeg") ? "jpg" : "png";
    const path = `${projectId}/ai-${randomUUID()}.${ext}`;
    const bytes = Buffer.from(img.base64, "base64");
    const up = await sb.storage.from(IMG_BUCKET).upload(path, bytes, {
      contentType: img.mime,
      upsert: false,
    });
    if (up.error) return { ok: false, url: "", msg: `No se pudo guardar la imagen: ${up.error.message}` };
    const { data } = sb.storage.from(IMG_BUCKET).getPublicUrl(path);
    return { ok: true, url: data.publicUrl, msg: "Imagen generada con Gemini." };
  } catch (e) {
    return { ok: false, url: "", msg: `Error al generar la imagen: ${(e as Error).message}` };
  }
}

// ── Estudio de propuestas multi-modelo ──────────────────────────────────
export interface GenProposalsResult {
  ok: boolean;
  proposals: Proposal[];
  msg: string;
}

// Limpia las referencias que llegan del cliente: solo strings, sin vacíos,
// con tope de cantidad y longitud (evita inflar el prompt / abuso).
function sanitizeBrief(brief?: BriefRefs): BriefRefs | undefined {
  if (!brief) return undefined;
  const clean = (arr: unknown): string[] =>
    Array.isArray(arr)
      ? arr.map((x) => String(x).trim()).filter(Boolean).slice(0, 20).map((s) => s.slice(0, 500))
      : [];
  const out = { links: clean(brief.links), images: clean(brief.images), videos: clean(brief.videos) };
  return out.links.length || out.images.length || out.videos.length ? out : undefined;
}

// Genera propuestas con TODOS los modelos disponibles a partir de un brief.
export async function generarPropuestas(
  prompt: string,
  platforms: string[],
  brief?: BriefRefs,
): Promise<GenProposalsResult> {
  await requireMember("editor");
  if (!prompt?.trim()) return { ok: false, proposals: [], msg: "Escribí un brief." };
  const pf = (platforms.length ? platforms : PLATFORMS.map((p) => p.id)) as Platform[];
  try {
    const proposals = await generateProposals(prompt.trim(), pf, sanitizeBrief(brief));
    if (!proposals.length) {
      return { ok: false, proposals: [], msg: "Ningún modelo devolvió propuesta. Reintentá." };
    }
    return { ok: true, proposals, msg: `${proposals.length} propuestas generadas.` };
  } catch (e) {
    return { ok: false, proposals: [], msg: (e as Error).message };
  }
}

// Afina una propuesta puntual con un prompt particular (mismo modelo).
export async function afinarPropuesta(
  base: Proposal,
  refinePrompt: string,
  platforms: string[],
  brief?: BriefRefs,
): Promise<{ ok: boolean; proposal?: Proposal; msg: string }> {
  await requireMember("editor");
  if (!refinePrompt?.trim()) return { ok: false, msg: "Escribí el ajuste." };
  const pf = (platforms.length ? platforms : PLATFORMS.map((p) => p.id)) as Platform[];
  try {
    const proposal = await refineProposal(base, refinePrompt.trim(), pf, sanitizeBrief(brief));
    return { ok: true, proposal, msg: "Propuesta afinada." };
  } catch (e) {
    return { ok: false, msg: (e as Error).message };
  }
}

// Genera una imagen para una propuesta del estudio.
export async function generarImagenPropuesta(
  prompt: string,
): Promise<{ ok: boolean; url?: string; msg: string }> {
  const { id: projectId } = await requireMember("editor");
  if (!prompt?.trim()) return { ok: false, msg: "Falta el prompt de la imagen." };
  return generateProposalImage(projectId, prompt.trim());
}

// Envía un job de video para una propuesta (SiliconFlow, async).
export async function generarVideoPropuesta(
  prompt: string,
): Promise<{ ok: boolean; requestId?: string; msg: string }> {
  await requireMember("editor");
  if (!prompt?.trim()) return { ok: false, msg: "Falta el prompt del video." };
  return submitProposalVideo(prompt.trim());
}

// Consulta el estado de un job de video.
export async function estadoVideoPropuesta(
  requestId: string,
): Promise<{ ok: boolean; status: string; url?: string; reason?: string }> {
  await requireMember("editor");
  if (!requestId) return { ok: false, status: "failed", reason: "Sin requestId." };
  return checkProposalVideo(requestId);
}

// Publica un texto (con imagen opcional) en Facebook y/o Instagram (Meta API).
export async function publicarDirecto(
  mensaje: string,
  targets: string[],
  imageUrl?: string,
): Promise<{ ok: boolean; msg: string }> {
  const { id: projectId } = await requireMember("editor");
  if (!mensaje?.trim() && !imageUrl) return { ok: false, msg: "Sin contenido para publicar." };
  const done: string[] = [];
  if (targets.includes("fb")) {
    const r = await publishToPage({ message: mensaje, imageUrl: imageUrl || undefined });
    if (!r.ok) return { ok: false, msg: `Facebook: ${r.error}` };
    done.push(`Facebook${r.mode === "mock" ? " (mock)" : ""}: ${r.id ?? ""}`);
  }
  if (targets.includes("ig")) {
    if (!imageUrl) return { ok: false, msg: "Instagram requiere una imagen." };
    const r = await publishToInstagram({ imageUrl, caption: mensaje || undefined });
    if (!r.ok) return { ok: false, msg: `Instagram: ${r.error}` };
    done.push(`Instagram${r.mode === "mock" ? " (mock)" : ""}: ${r.id ?? ""}`);
  }
  await logAudit({
    action: "post.publish",
    projectId,
    actor: await actorEmail(),
    entity_type: "post",
    details: { via: "studio", targets },
  });
  return { ok: true, msg: `Listo. ${done.join(" · ")}` };
}

// Publica en Facebook y/o Instagram según los destinos elegidos.
export async function publicarPost(formData: FormData) {
  const { id: projectId } = await requireMember("editor");
  const mensaje = String(formData.get("mensaje") ?? "").trim();
  const link = String(formData.get("link") ?? "").trim();
  const imageUrl = String(formData.get("imageUrl") ?? "").trim();
  const targets = formData.getAll("targets").map(String);

  if (targets.length === 0) redirect("/publicaciones?error=targets");
  if (link && !/^https?:\/\//i.test(link)) redirect("/publicaciones?error=link");
  if (targets.includes("fb") && !mensaje && !imageUrl) {
    redirect("/publicaciones?error=fb_vacio");
  }
  if (targets.includes("ig") && !imageUrl) redirect("/publicaciones?error=ig_img");

  const out: { fb?: string; ig?: string } = {};
  let mode: "mock" | "live" = "mock";

  if (targets.includes("fb")) {
    const r = await publishToPage({
      message: mensaje,
      link: link || undefined,
      imageUrl: imageUrl || undefined,
    });
    if (!r.ok) {
      redirect(`/publicaciones?error=fb&detalle=${encodeURIComponent(r.error ?? "")}`);
    }
    out.fb = r.id;
    mode = r.mode;
  }
  if (targets.includes("ig")) {
    const r = await publishToInstagram({ imageUrl, caption: mensaje || undefined });
    if (!r.ok) {
      redirect(`/publicaciones?error=ig&detalle=${encodeURIComponent(r.error ?? "")}`);
    }
    out.ig = r.id;
    mode = r.mode;
  }

  await logAudit({
    action: "post.publish",
    projectId,
    actor: await actorEmail(),
    entity_type: "post",
    details: { targets, mode, ...out },
  });

  const qs = new URLSearchParams({ ok: "publicado", mode });
  if (out.fb) qs.set("fb", out.fb);
  if (out.ig) qs.set("ig", out.ig);
  revalidatePath("/publicaciones");
  redirect(`/publicaciones?${qs.toString()}`);
}

// ── Contextos (briefs) guardados del Estudio ────────────────────────────
const cleanList = (arr: unknown): string[] =>
  Array.isArray(arr)
    ? arr.map((x) => String(x).trim()).filter(Boolean).slice(0, 20).map((s) => s.slice(0, 500))
    : [];

export async function listarBriefs(): Promise<SavedBrief[]> {
  const { id: projectId } = await requireMember("editor");
  return listBriefs(projectId);
}

// Crea o actualiza un contexto guardado. `id` presente → actualiza.
export async function guardarBrief(
  input: BriefInput,
  id?: string,
): Promise<{ ok: boolean; brief?: SavedBrief; msg: string }> {
  const { id: projectId } = await requireMember("editor");
  const nombre = String(input?.nombre ?? "").trim().slice(0, 120);
  if (!nombre) return { ok: false, msg: "Poné un nombre al contexto." };
  const clean: BriefInput = {
    nombre,
    prompt: String(input?.prompt ?? "").slice(0, 8000),
    links: cleanList(input?.links),
    images: cleanList(input?.images),
    videos: cleanList(input?.videos),
    platforms: cleanList(input?.platforms),
  };
  try {
    const brief = await saveBrief(projectId, clean, (await actorEmail()) ?? undefined, id);
    return { ok: true, brief, msg: id ? "Contexto actualizado." : "Contexto guardado." };
  } catch (e) {
    return { ok: false, msg: `No se pudo guardar: ${(e as Error).message}` };
  }
}

export async function eliminarBrief(id: string): Promise<{ ok: boolean; msg: string }> {
  const { id: projectId } = await requireMember("editor");
  if (!id) return { ok: false, msg: "Falta el id." };
  try {
    await deleteBrief(projectId, id);
    return { ok: true, msg: "Contexto eliminado." };
  } catch (e) {
    return { ok: false, msg: `No se pudo eliminar: ${(e as Error).message}` };
  }
}

// Promociona (boost) un post de la Página. El ad se crea PAUSADO.
export async function promocionarPost(formData: FormData) {
  const { id: projectId } = await requireMember("editor");
  const postId = String(formData.get("postId") ?? "").trim();
  const presupuesto = Number(formData.get("presupuesto") ?? 0);
  const dias = Number(formData.get("dias") ?? 0);
  const pais = (String(formData.get("pais") ?? "AR").trim().toUpperCase() || "AR").slice(0, 2);

  if (!postId) redirect("/publicaciones?error=promo_post");
  if (!(presupuesto > 0) || !(dias > 0)) redirect("/publicaciones?error=promo_datos");

  const r = await promotePagePost({
    postId,
    dailyBudgetUsd: presupuesto,
    days: dias,
    countries: [pais],
    nowMs: Date.now(),
  });
  if (!r.ok) {
    redirect(`/publicaciones?error=promo&detalle=${encodeURIComponent(r.error ?? "")}`);
  }

  await logAudit({
    action: "post.promote",
    projectId,
    actor: await actorEmail(),
    entity_type: "ad",
    entity_id: r.id,
    details: { postId, presupuesto, dias, pais, mode: r.mode },
  });
  const qs = new URLSearchParams({ ok: "promocionado", mode: r.mode });
  if (r.id) qs.set("ad", r.id);
  revalidatePath("/publicaciones");
  redirect(`/publicaciones?${qs.toString()}`);
}
