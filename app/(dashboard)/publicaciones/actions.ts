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
import { generateGeminiText } from "@/lib/gemini";
import { generateText } from "@/lib/anthropic";
import { incrementUsage } from "@/lib/quota";

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
