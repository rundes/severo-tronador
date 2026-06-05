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
  const formato = String(formData.get("formato") ?? "texto") === "html"
    ? "html"
    : "texto";
  const cuerpoHtml = String(formData.get("cuerpoHtml") ?? "");

  if (!cuerpo.trim() && !(formato === "html" && cuerpoHtml.trim())) {
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
