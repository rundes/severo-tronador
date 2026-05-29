"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  SegmentFilterSchema,
  formToObject,
  summarizeZodError,
} from "@/lib/schemas";
import { z } from "zod";
import {
  deleteSegment,
  getSavedSegment,
  saveSegment,
} from "@/lib/segments-store";
import { logAudit } from "@/lib/audit";

const GuardarSegmentoSchema = z.object({
  nombre: z.string().trim().min(1, "Nombre requerido").max(120),
  filtros: SegmentFilterSchema,
});

export async function guardarSegmento(formData: FormData) {
  const raw = formToObject(formData);
  const bands = formData.getAll("healthBands").map(String);
  const parsed = GuardarSegmentoSchema.safeParse({
    nombre: raw.nombre,
    filtros: {
      sexo: raw.sexo,
      edadMin: raw.edadMin,
      edadMax: raw.edadMax,
      barrio: raw.barrio,
      circuito: raw.circuito,
      mesa: raw.mesa,
      healthMin: raw.healthMin,
      healthBands: bands.length > 0 ? bands : undefined,
      respondedWithinDays: raw.respondedWithinDays,
      notContactedDays: raw.notContactedDays,
      hasEmail: raw.hasEmail === "1" ? true : raw.hasEmail === "0" ? false : undefined,
      hasTelefono: raw.hasTelefono === "1" ? true : raw.hasTelefono === "0" ? false : undefined,
      preferredChannel: raw.preferredChannel,
    },
  });
  if (!parsed.success) {
    const qs = new URLSearchParams({
      error: "validacion",
      detalle: summarizeZodError(parsed.error),
    });
    redirect(`/segmentos?${qs}`);
  }

  const session = await auth();
  const email = session?.user?.email ?? null;
  const saved = await saveSegment(parsed.data.nombre, parsed.data.filtros, email ?? undefined);
  await logAudit({
    action: "segment.save",
    actor: email,
    entity_type: "segment",
    entity_id: saved.id,
    details: { nombre: saved.nombre },
  });
  revalidatePath("/segmentos");
  redirect("/segmentos?guardado=1");
}

export async function borrarSegmento(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const seg = await getSavedSegment(id);
  if (!seg) return;
  await deleteSegment(id);
  const session = await auth();
  await logAudit({
    action: "segment.delete",
    actor: session?.user?.email ?? null,
    entity_type: "segment",
    entity_id: id,
    details: { nombre: seg.nombre },
  });
  revalidatePath("/segmentos");
}
