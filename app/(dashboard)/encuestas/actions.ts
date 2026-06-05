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
} from "@/lib/encuestas";
import { executeCampaign } from "@/lib/campaigns";
import { getSavedSegment } from "@/lib/segments-store";
import type { SegmentFilter } from "@/lib/segments";
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
  const { id: projectId } = await requireMember("editor");

  const enc = await getEncuesta(projectId, id);
  if (!enc || enc.estado !== "publicada") {
    redirect(`/encuestas/${id}?error=no_publicada`);
  }
  if (!templateId || !segmentId) redirect(`/encuestas/${id}?error=envio_datos`);
  const seg = await getSavedSegment(projectId, segmentId);
  if (!seg) redirect(`/encuestas/${id}?error=envio_datos`);

  const result = await executeCampaign(projectId, {
    nombre: `Encuesta: ${enc.titulo}`,
    channel: "email",
    templateId,
    segmentFilter: seg.filtros as SegmentFilter,
    encuestaId: enc.id,
  });
  await logAudit({
    action: "survey.send",
    projectId,
    actor: await actorEmail(),
    entity_type: "survey",
    entity_id: id,
    details: { segmento: seg.nombre, ok: result.ok, reason: result.ok ? null : result.reason },
  });
  if (!result.ok) {
    redirect(`/encuestas/${id}?error=envio&detalle=${encodeURIComponent(result.reason)}`);
  }
  revalidatePath(`/encuestas/${id}`);
  redirect(`/encuestas/${id}?ok=enviada`);
}

export async function cerrarEncuesta(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { id: projectId } = await requireMember("editor");
  await closeEncuesta(projectId, id);
  revalidatePath(`/encuestas/${id}`);
  redirect(`/encuestas/${id}?ok=cerrada`);
}
