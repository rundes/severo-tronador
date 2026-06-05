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
} from "@/lib/encuestas";
import type { Question } from "@/lib/encuestas/types";

async function actorEmail(): Promise<string | null> {
  const s = await auth();
  return s?.user?.email ?? null;
}

export async function crearEncuesta(formData: FormData) {
  const titulo = String(formData.get("titulo") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim();
  if (!titulo) redirect("/encuestas/nueva?error=titulo");

  const { id: projectId } = await requireMember("editor");
  const enc = await createEncuesta(projectId, { titulo, descripcion });
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

export async function cerrarEncuesta(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { id: projectId } = await requireMember("editor");
  await closeEncuesta(projectId, id);
  revalidatePath(`/encuestas/${id}`);
  redirect(`/encuestas/${id}?ok=cerrada`);
}
