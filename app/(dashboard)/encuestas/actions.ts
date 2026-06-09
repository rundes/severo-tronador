"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { requireMember } from "@/lib/workspace";
import {
  createEncuesta,
  updateEncuesta,
  publishEncuesta,
  closeEncuesta,
  getEncuesta,
  deleteEncuesta,
  duplicateEncuesta,
} from "@/lib/encuestas";
import { deleteResponses } from "@/lib/encuestas/responses";
import { executeCampaign, SURVEY_SEND_CHANNELS, outreachConnectorFor } from "@/lib/campaigns";
import { getSavedSegment } from "@/lib/segments-store";
import { listGrupos, grupoExiste } from "@/lib/grupos";
import { getTemplate, interpolate } from "@/lib/templates";
import { renderCampaignEmailHtml } from "@/lib/email-render";
import { interpolateExtended } from "@/lib/interpolate-vars";
import type { Contact } from "@/lib/connectors/types";
import type { SegmentFilter } from "@/lib/segments";
import type { Channel } from "@/lib/relationship";
import type { Question } from "@/lib/encuestas/types";

async function actorEmail(): Promise<string | null> {
  const s = await auth();
  return s?.user?.email ?? null;
}

export async function crearEncuesta(formData: FormData) {
  const titulo = String(formData.get("titulo") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim();
  if (!titulo) redirect("/encuestas/nueva?error=titulo");

  const layout = String(formData.get("layout") ?? "minimal");
  const { id: projectId } = await requireMember("editor");
  const enc = await createEncuesta(projectId, { titulo, descripcion, layout });
  await logAudit({
    action: "survey.create",
    projectId,
    actor: await actorEmail(),
    entity_type: "survey",
    entity_id: enc.id,
    details: { titulo },
  });
  revalidatePath("/encuestas");
  redirect(`/encuestas/${enc.id}`);
}

// El editor cliente serializa las preguntas a un input hidden "preguntas" (JSON).
export async function guardarPreguntas(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const titulo = String(formData.get("titulo") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim();
  const layout = String(formData.get("layout") ?? "minimal");
  const stepMode = String(formData.get("step_mode") ?? "one");
  const imageUrl = String(formData.get("image_url") ?? "").trim();
  const imageEndUrl = String(formData.get("image_end_url") ?? "").trim();
  const mensajeFinal = String(formData.get("mensaje_final") ?? "").trim();
  const ctaLabel = String(formData.get("cta_label") ?? "").trim();
  const ctaUrl = String(formData.get("cta_url") ?? "").trim();
  let preguntas: Question[];
  try {
    preguntas = JSON.parse(String(formData.get("preguntas") ?? "[]")) as Question[];
  } catch {
    redirect(`/encuestas/${id}?error=preguntas`);
  }

  const { id: projectId } = await requireMember("editor");
  try {
    await updateEncuesta(projectId, id, {
      titulo: titulo || undefined,
      descripcion,
      preguntas,
      layout,
      stepMode,
      imageUrl,
      imageEndUrl,
      mensajeFinal,
      ctaLabel,
      ctaUrl,
    });
  } catch (err) {
    redirect(
      `/encuestas/${id}?error=validacion&detalle=${encodeURIComponent(
        (err as Error).message,
      )}`,
    );
  }
  revalidatePath(`/encuestas/${id}`);
  redirect(`/encuestas/${id}?ok=guardada`);
}

export async function publicarEncuesta(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { id: projectId } = await requireMember("editor");
  try {
    const pub = await publishEncuesta(projectId, id);
    await logAudit({
      action: "survey.publish",
      projectId,
      actor: await actorEmail(),
      entity_type: "survey",
      entity_id: id,
      details: { slug: pub?.slug },
    });
  } catch (err) {
    redirect(
      `/encuestas/${id}?error=validacion&detalle=${encodeURIComponent(
        (err as Error).message,
      )}`,
    );
  }
  revalidatePath(`/encuestas/${id}`);
  redirect(`/encuestas/${id}?ok=publicada`);
}

export async function enviarEncuestaPorMail(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const templateId = String(formData.get("templateId") ?? "").trim();
  const segmentId = String(formData.get("segmentId") ?? "").trim();
  const channelRaw = String(formData.get("channel") ?? "email").trim();
  const channel: Channel = SURVEY_SEND_CHANNELS.includes(channelRaw as Channel)
    ? (channelRaw as Channel)
    : "email";
  const { id: projectId } = await requireMember("editor");

  const enc = await getEncuesta(projectId, id);
  if (!enc || enc.estado !== "publicada") {
    redirect(`/encuestas/${id}?error=no_publicada`);
  }
  if (!templateId || !segmentId) redirect(`/encuestas/${id}?error=envio_datos`);

  // El destino puede ser un segmento guardado (seg:<id>) o un grupo de
  // contactos (grupo:<id>). Sin prefijo se asume segmento (retrocompat).
  let segmentFilter: SegmentFilter;
  let destinoNombre: string;
  if (segmentId.startsWith("grupo:")) {
    const grupoId = segmentId.slice(6);
    if (!(await grupoExiste(projectId, grupoId))) {
      redirect(`/encuestas/${id}?error=envio_datos`);
    }
    segmentFilter = { grupoId } as SegmentFilter;
    const grupos = await listGrupos(projectId);
    destinoNombre = grupos.find((g) => g.id === grupoId)?.nombre ?? "grupo";
  } else {
    const segId = segmentId.startsWith("seg:") ? segmentId.slice(4) : segmentId;
    const seg = await getSavedSegment(projectId, segId);
    if (!seg) redirect(`/encuestas/${id}?error=envio_datos`);
    segmentFilter = seg.filtros as SegmentFilter;
    destinoNombre = seg.nombre;
  }

  const result = await executeCampaign(projectId, {
    nombre: `Encuesta: ${enc.titulo}`,
    channel,
    templateId,
    segmentFilter,
    encuestaId: enc.id,
  });
  await logAudit({
    action: "survey.send",
    projectId,
    actor: await actorEmail(),
    entity_type: "survey",
    entity_id: id,
    details: { destino: destinoNombre, channel, ok: result.ok, reason: result.ok ? null : result.reason },
  });
  if (!result.ok) {
    redirect(`/encuestas/${id}?error=envio&detalle=${encodeURIComponent(result.reason)}`);
  }
  revalidatePath(`/encuestas/${id}`);
  redirect(`/encuestas/${id}?ok=enviada`);
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^[+\d][\d\s()-]{6,}$/;

// Envía UN mensaje de prueba de la encuesta al mail/teléfono indicado, por el
// canal elegido, usando la plantilla seleccionada. No crea campaña ni toca la
// cuota masiva: es un solo envío (en mock si el canal no tiene credenciales).
// El link es el público /e/<slug> (sin token, no atribuye respuesta).
export async function probarEnvioEncuesta(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const templateId = String(formData.get("templateId") ?? "").trim();
  const destino = String(formData.get("destino") ?? "").trim();
  const channelRaw = String(formData.get("channel") ?? "email").trim();
  const channel: Channel = SURVEY_SEND_CHANNELS.includes(channelRaw as Channel)
    ? (channelRaw as Channel)
    : "email";
  const { id: projectId } = await requireMember("editor");

  const enc = await getEncuesta(projectId, id);
  if (!enc || enc.estado !== "publicada" || !enc.slug) {
    redirect(`/encuestas/${id}?error=no_publicada`);
  }
  if (!templateId || !destino) redirect(`/encuestas/${id}?error=prueba_datos`);

  // Validación del destino según canal.
  const okFormato = channel === "email" ? EMAIL_RE.test(destino) : PHONE_RE.test(destino);
  if (!okFormato) redirect(`/encuestas/${id}?error=prueba_destino`);

  const tpl = await getTemplate(templateId);
  if (!tpl) redirect(`/encuestas/${id}?error=prueba_datos`);

  const connector = outreachConnectorFor(channel);
  if (!connector) redirect(`/encuestas/${id}?error=prueba&detalle=canal sin conector`);

  const contact: Contact = {
    dni: "PRUEBA",
    nombre: "Prueba",
    apellido: "",
    ...(channel === "email" ? { email: destino } : { telefono: destino }),
  };
  const base = process.env.NEXTAUTH_URL ?? "";
  const surveyUrl = `${base}/e/${enc.slug}`;
  const body =
    channel === "email"
      ? renderCampaignEmailHtml(tpl, contact, { surveyUrl })
      : interpolateExtended(tpl.cuerpo, contact, { surveyUrl });
  const subject = tpl.asunto ? `[PRUEBA] ${interpolate(tpl.asunto, contact)}` : undefined;

  let result: { ok: boolean; error?: string };
  try {
    result = await connector.send({ subject, body }, contact, projectId);
  } catch (e) {
    result = { ok: false, error: (e as Error).message };
  }

  await logAudit({
    action: "survey.send",
    projectId,
    actor: await actorEmail(),
    entity_type: "survey",
    entity_id: id,
    details: { prueba: true, channel, destino, ok: result.ok, reason: result.ok ? null : result.error },
  });

  if (!result.ok) {
    redirect(`/encuestas/${id}?error=prueba&detalle=${encodeURIComponent(result.error ?? "")}`);
  }
  redirect(`/encuestas/${id}?ok=prueba_enviada&dest=${encodeURIComponent(destino)}`);
}

export async function eliminarEncuesta(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { id: projectId } = await requireMember("editor");
  const enc = await getEncuesta(projectId, id);
  await deleteEncuesta(projectId, id);
  await logAudit({
    action: "survey.delete",
    projectId,
    actor: await actorEmail(),
    entity_type: "survey",
    entity_id: id,
    details: { titulo: enc?.titulo },
  });
  revalidatePath("/encuestas");
  redirect("/encuestas?ok=eliminada");
}

// Duplica una encuesta para reutilizar su contenido. La copia queda en
// borrador; redirige a su editor.
export async function duplicarEncuesta(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { id: projectId } = await requireMember("editor");
  const copy = await duplicateEncuesta(projectId, id);
  if (!copy) redirect("/encuestas?error=duplicar");
  await logAudit({
    action: "survey.create",
    projectId,
    actor: await actorEmail(),
    entity_type: "survey",
    entity_id: copy.id,
    details: { titulo: copy.titulo, duplicada_de: id },
  });
  revalidatePath("/encuestas");
  redirect(`/encuestas/${copy.id}?ok=duplicada`);
}

// Borra TODAS las respuestas de una encuesta (mantiene la encuesta) para
// arrancar de cero. El modal de la UI ofrece exportar antes de confirmar.
export async function borrarRespuestas(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { id: projectId } = await requireMember("editor");
  const enc = await getEncuesta(projectId, id);
  const n = await deleteResponses(projectId, id);
  await logAudit({
    action: "survey.responses_reset",
    projectId,
    actor: await actorEmail(),
    entity_type: "survey",
    entity_id: id,
    details: { titulo: enc?.titulo, borradas: n },
  });
  revalidatePath(`/encuestas/${id}`);
  redirect(`/encuestas/${id}?ok=respuestas_borradas&n=${n}`);
}

export async function cerrarEncuesta(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { id: projectId } = await requireMember("editor");
  await closeEncuesta(projectId, id);
  revalidatePath(`/encuestas/${id}`);
  redirect(`/encuestas/${id}?ok=cerrada`);
}
