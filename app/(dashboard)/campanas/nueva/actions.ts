"use server";

import { redirect } from "next/navigation";
import { executeCampaign } from "@/lib/campaigns";
import {
  CrearCampanaSchema,
  formToObject,
  summarizeZodError,
} from "@/lib/schemas";
import { decodeQuery } from "@/lib/segment-query";

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

  const res = await executeCampaign({
    ...parsed.data,
    segmentQuery: segmentQuery ?? undefined,
  });
  if (res.ok) redirect(`/campanas/${res.campaign.id}`);

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
