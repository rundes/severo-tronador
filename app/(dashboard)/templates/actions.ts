"use server";

import { redirect } from "next/navigation";
import { createTemplate } from "@/lib/templates";
import { NuevaPlantillaSchema, formToObject, isValidEmail } from "@/lib/schemas";
import { auth } from "@/lib/auth";
import { requireProject } from "@/lib/workspace";
import { resendConnector } from "@/lib/connectors/resend";
import { renderCampaignEmailHtml } from "@/lib/email-render";
import { interpolate } from "@/lib/templates";
import { logAudit } from "@/lib/audit";
import type { Contact } from "@/lib/connectors/types";
import { getConnectorConfig } from "@/lib/connectors/config";
import { generateText } from "@/lib/anthropic";
import { generateGeminiText } from "@/lib/gemini";
import { sanitizeEmailHtml } from "@/lib/email-sanitize";
import { incrementUsage } from "@/lib/quota";
import { SUPPORTED_VARS } from "@/lib/interpolate-vars";

export async function nuevaPlantilla(formData: FormData) {
  const parsed = NuevaPlantillaSchema.safeParse(formToObject(formData));
  if (!parsed.success) redirect("/templates?error=campos");

  await createTemplate({
    channel: parsed.data.channel,
    nombre: parsed.data.nombre,
    asunto: parsed.data.asunto,
    cuerpo: parsed.data.cuerpo,
    formato: parsed.data.formato,
    cuerpoHtml: parsed.data.cuerpoHtml,
    estado: "activo",
  });
  redirect("/templates");
}

export interface AiHtmlState {
  ok: boolean | null;
  html: string;
  msg: string;
}

// Genera (o refina) el cuerpo HTML de una plantilla de email a partir de
// instrucciones en lenguaje natural, usando la cuenta de Claude del usuario
// (API key del conector claude-api). Devuelve HTML ya sanitizado, listo para
// previsualizar y guardar. El form envía `prompt` y, opcionalmente, el HTML
// actual (`current`) para iterar sobre él.
export async function generarHtmlConIA(
  _prev: AiHtmlState,
  formData: FormData,
): Promise<AiHtmlState> {
  const { id: projectId } = await requireProject();
  const prompt = String(formData.get("prompt") ?? "").trim();
  const current = String(formData.get("current") ?? "").trim();
  if (!prompt) return { ok: false, html: "", msg: "Escribí qué querés que genere." };

  const claude = await getConnectorConfig("claude-api");
  const google = await getConnectorConfig("google-ai");
  if (!claude.ANTHROPIC_API_KEY && !google.GOOGLE_AI_API_KEY) {
    return {
      ok: false,
      html: "",
      msg: "Configurá Claude API o Google AI en Conectores para generar con IA.",
    };
  }

  const varsList = SUPPORTED_VARS.map((v) => `{{${v.key}}} (${v.desc})`).join(", ");
  const system = [
    "Sos un asistente que genera el cuerpo HTML de emails para una plataforma",
    "de relevamiento de opinión pública. Devolvé SOLO un fragmento HTML (sin",
    "<html>, <head> ni <body>, sin envoltorio de marca, sin bloque de código",
    "ni explicaciones). El layout exterior y el pie de baja los agrega la",
    "plataforma.",
    "",
    "Reglas estrictas:",
    "- Estilos SIEMPRE inline (style=\"...\"); no uses <style> ni clases.",
    "- Tags permitidos: p, br, div, span, strong, b, em, i, u, a, ul, ol, li,",
    "  blockquote, hr, h1-h6, img, table, thead, tbody, tr, td, th, center, small.",
    "- Para botones usá un <a> con padding y background inline.",
    "- Tablas con border-collapse y celdas con borde+padding inline.",
    "- Cuando corresponda, usá estas variables tal cual (se reemplazan al enviar): " + varsList + ".",
    "- Texto en español rioplatense, claro y respetuoso.",
    "- No inventes imágenes con src ficticios; si hace falta una imagen, dejá",
    "  un <img> con un src placeholder https:// solo si el usuario lo pide.",
  ].join("\n");

  const userPrompt = current
    ? `HTML actual del email:\n\n${current}\n\nModificalo según esta indicación:\n${prompt}`
    : `Generá el cuerpo HTML del email según esta indicación:\n${prompt}`;

  // Genera con Claude; si falla (modelo no disponible, etc.) cae a Gemini.
  let text = "";
  let usedClaude = false;
  let claudeErr: string | null = null;
  if (claude.ANTHROPIC_API_KEY) {
    try {
      const r = await generateText({ apiKey: claude.ANTHROPIC_API_KEY, system, prompt: userPrompt });
      text = r.text;
      usedClaude = true;
      await incrementUsage("claude-api", r.inputTokens + r.outputTokens, projectId);
    } catch (e) {
      claudeErr = (e as Error).message;
    }
  }
  if (!text && google.GOOGLE_AI_API_KEY) {
    try {
      const r = await generateGeminiText({ apiKey: google.GOOGLE_AI_API_KEY, system, prompt: userPrompt });
      text = r.text;
      await incrementUsage("google-ai", Math.ceil((userPrompt.length + r.text.length) / 4), projectId);
    } catch (e) {
      return { ok: false, html: "", msg: `Error al generar: ${(e as Error).message}` };
    }
  }
  if (!text) {
    return { ok: false, html: "", msg: `Error al generar: ${claudeErr ?? "sin respuesta"}` };
  }

  // Quita cercos de código si el modelo igual los puso, y sanitiza al mismo
  // allowlist que el envío real.
  const stripped = text
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const html = sanitizeEmailHtml(stripped);
  if (!html.trim()) {
    return { ok: false, html: "", msg: "El asistente no devolvió HTML utilizable. Probá reformular." };
  }
  return {
    ok: true,
    html,
    msg: `Listo (${usedClaude ? "Claude" : "Gemini"}). Revisá el preview y ajustá si hace falta.`,
  };
}

// Contacto sintético para previsualizar/probar: valores realistas que
// disparan los fallbacks ({{barrio}} → "Centro", etc.) sin tocar el padrón.
function sampleContact(email: string): Contact {
  return {
    dni: "30123456",
    nombre: "Vecina",
    apellido: "de Prueba",
    sexo: "F",
    barrio: "Centro",
    circuito: "12",
    mesa: "0345",
    email,
  };
}

interface PruebaState {
  ok: boolean | null;
  msg: string;
}

// Envía un email de prueba con el contenido actual del editor a tu propia
// casilla (o a una dirección que indiques), renderizado IGUAL que el envío
// real de campaña. Pensado para validar el diseño HTML antes de lanzar.
export async function enviarPruebaTemplate(
  _prev: PruebaState,
  formData: FormData,
): Promise<PruebaState> {
  const session = await auth();
  const userEmail = session?.user?.email?.toLowerCase();
  if (!userEmail) return { ok: false, msg: "Sesión requerida." };

  const channel = String(formData.get("channel") ?? "email");
  if (channel !== "email") {
    return { ok: false, msg: "El envío de prueba solo aplica a email." };
  }

  const override = String(formData.get("to") ?? "").trim().toLowerCase();
  const to = override || userEmail;
  if (!isValidEmail(to)) {
    return { ok: false, msg: `Dirección inválida: ${to}` };
  }

  const asunto = String(formData.get("asunto") ?? "").trim();
  const cuerpo = String(formData.get("cuerpo") ?? "");
  const rawFormato = String(formData.get("formato") ?? "texto");
  const formato: "texto" | "html" | "html_full" =
    rawFormato === "html" ? "html" : rawFormato === "html_full" ? "html_full" : "texto";
  const cuerpoHtml = String(formData.get("cuerpoHtml") ?? "");
  const isHtml = formato === "html" || formato === "html_full";

  if (!cuerpo.trim() && !(isHtml && cuerpoHtml.trim())) {
    return { ok: false, msg: "Escribí un cuerpo antes de mandar la prueba." };
  }

  const { id: projectId } = await requireProject();
  const contact = sampleContact(to);
  const sampleUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/encuesta/demo`;

  const html = renderCampaignEmailHtml(
    { cuerpo, cuerpoHtml, formato },
    contact,
    { surveyUrl: sampleUrl, preheader: asunto || undefined },
  );
  const subject = `[PRUEBA] ${asunto ? interpolate(asunto, contact) : "Plantilla sin asunto"}`;

  const result = await resendConnector.send(
    { subject, body: html },
    contact,
    projectId,
  );

  await logAudit({
    action: "template.test_send",
    projectId,
    actor: userEmail,
    entity_type: "template",
    details: { to, ok: result.ok, error: result.error },
  });

  if (!result.ok) {
    return { ok: false, msg: `No se pudo enviar: ${result.error ?? "error"}` };
  }
  const mock = result.providerMessageId?.startsWith("mock-");
  return {
    ok: true,
    msg: mock
      ? `Prueba simulada (modo mock, sin RESEND_API_KEY) hacia ${to}.`
      : `Prueba enviada a ${to}. Revisá tu casilla.`,
  };
}
