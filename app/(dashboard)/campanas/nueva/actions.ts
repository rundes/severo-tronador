"use server";

import { redirect } from "next/navigation";
import { executeCampaign } from "@/lib/campaigns";
import { getEncuesta } from "@/lib/encuestas";
import {
  CrearCampanaSchema,
  formToObject,
  summarizeZodError,
} from "@/lib/schemas";
import { decodeQuery } from "@/lib/segment-query";
import { logAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { requireMember } from "@/lib/workspace";

export async function crearCampana(formData: FormData) {
  const raw = formToObject(formData);
  const preguntas = String(formData.get("preguntas") ?? "")
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);

  // Modo avanzado: si el form trae `q` (encoded SegmentQuery), lo
  // decodificamos y bypasseamos los filtros planos. La validación zod
  // sigue corriendo sobre el resto (nombre, templateId, channel).
  const qParam = typeof raw.q === "string" ? raw.q : undefined;
  const segmentQuery = qParam ? decodeQuery(qParam) : null;

  const parsed = CrearCampanaSchema.safeParse({
    nombre: raw.nombre,
    templateId: raw.templateId,
    channel: raw.channel,
    preguntas,
    segmentFilter: segmentQuery
      ? {} // sin uso cuando hay query
      : {
          sexo: raw.sexo,
          edadMin: raw.edadMin,
          edadMax: raw.edadMax,
          barrio: raw.barrio,
          healthMin: raw.healthMin,
        },
  });

  if (!parsed.success) {
    const params = preservedParams(formData);
    params.set("error", "validacion");
    params.set("detalle", summarizeZodError(parsed.error));
    redirect(`/campanas/nueva?${params}`);
  }

  // A/B testing: si el form trae variant_b_template, armamos array de
  // variantes con pesos. Mantenemos el templateId como A.
  const variantBTemplate = String(formData.get("variant_b_template") ?? "").trim();
  const weightA = Number(formData.get("variant_a_weight") ?? 50);
  const weightB = Number(formData.get("variant_b_weight") ?? 50);
  const variants = variantBTemplate
    ? [
        {
          id: "A",
          template_id: parsed.data.templateId,
          weight: Number.isFinite(weightA) ? weightA : 50,
        },
        {
          id: "B",
          template_id: variantBTemplate,
          weight: Number.isFinite(weightB) ? weightB : 50,
        },
      ]
    : undefined;

  const { id: projectId } = await requireMember("editor");

  // Encuesta enlazada (opcional): debe existir y estar publicada. Si está
  // seteada, el token de cada envío resuelve a esa encuesta vía {{encuesta_url}}.
  const encuestaIdRaw = String(formData.get("encuestaId") ?? "").trim();
  let encuestaId: string | undefined;
  if (encuestaIdRaw) {
    const enc = await getEncuesta(projectId, encuestaIdRaw);
    if (enc && enc.estado === "publicada") encuestaId = enc.id;
  }

  const res = await executeCampaign(projectId, {
    ...parsed.data,
    encuestaId,
    segmentQuery: segmentQuery ?? undefined,
    variants,
  });
  if (res.ok) {
    const session = await auth();
    await logAudit({
      action: "campaign.create",
      projectId,
      actor: session?.user?.email ?? null,
      entity_type: "campaign",
      entity_id: res.campaign.id,
      details: {
        nombre: res.campaign.nombre,
        channel: res.campaign.channel,
        total: res.campaign.metrics.total,
      },
    });
    redirect(`/campanas/${res.campaign.id}`);
  }

  const params = preservedParams(formData);
  params.set("error", res.reason);
  if (res.reason === "quota_blocked") {
    params.set("needed", String(res.needed));
    params.set("remaining", String(res.remaining));
  }
  redirect(`/campanas/nueva?${params}`);
}

// Preserva los valores del form salvo templateId (no queremos repegar un id
// que pudo cambiar) ni el textarea de preguntas (overflow en URL).
function preservedParams(formData: FormData): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of formData.entries()) {
    if (k === "templateId" || k === "preguntas") continue;
    const s = String(v).trim();
    if (s) p.set(k, s);
  }
  return p;
}
