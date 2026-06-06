// Render server-side del cuerpo de un email de campaña a HTML final, listo
// para mandar a Resend. Centraliza la lógica que comparten el envío real
// (lib/campaigns.ts) y el envío de prueba (templates/actions.ts), para que el
// mail de prueba se vea EXACTAMENTE igual que el real.
import type { Contact } from "@/lib/connectors/types";
import { interpolateExtended } from "@/lib/interpolate-vars";
import { textToHtml, wrapEmailShell, wrapEmailMinimal } from "@/lib/email-html";
import { sanitizeEmailHtml } from "@/lib/email-sanitize";
import { ORG_NAME } from "@/lib/config";

export interface EmailTemplateInput {
  cuerpo: string;
  cuerpoHtml?: string | null;
  // "texto" → cuerpo plano; "html" → cuerpoHtml dentro del shell de marca;
  // "html_full" → cuerpoHtml ES el email completo (sin shell ni opt-out auto).
  formato?: "texto" | "html" | "html_full" | null;
}

export interface RenderEmailOpts {
  // URL (ya rastreada) que reemplaza {{encuesta_url}} en el cuerpo.
  surveyUrl?: string;
  // HTML extra inyectado al final del body (ej: pixel de apertura).
  trailingHtml?: string;
  preheader?: string;
}

// Devuelve el HTML completo del email (shell de marca + contenido interpolado).
export function renderCampaignEmailHtml(
  tpl: EmailTemplateInput,
  contact: Contact,
  opts: RenderEmailOpts = {},
): string {
  const ctx = { surveyUrl: opts.surveyUrl };
  const isHtml =
    (tpl.formato === "html" || tpl.formato === "html_full") &&
    !!tpl.cuerpoHtml &&
    tpl.cuerpoHtml.trim() !== "";

  // Modo "email completo": el cuerpoHtml es el documento entero. Se sanitiza
  // igual (seguridad) pero se envuelve en un shell mínimo sin marca ni opt-out.
  if (isHtml && tpl.formato === "html_full") {
    const interpolated = interpolateExtended(tpl.cuerpoHtml as string, contact, ctx);
    return wrapEmailMinimal({
      contentHtml: sanitizeEmailHtml(interpolated),
      preheader: opts.preheader,
      trailingHtml: opts.trailingHtml,
    });
  }

  let contentHtml: string;
  if (isHtml) {
    const interpolated = interpolateExtended(tpl.cuerpoHtml as string, contact, ctx);
    contentHtml = sanitizeEmailHtml(interpolated);
  } else {
    const text = interpolateExtended(tpl.cuerpo, contact, ctx);
    contentHtml = textToHtml(text);
  }

  return wrapEmailShell({
    contentHtml,
    orgName: ORG_NAME,
    preheader: opts.preheader,
    trailingHtml: opts.trailingHtml,
  });
}
