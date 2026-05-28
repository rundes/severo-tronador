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

const GuardarSegmentoSchema = z.object({
  nombre: z.string().trim().min(1, "Nombre requerido").max(120),
  filtros: SegmentFilterSchema,
});

export async function guardarSegmento(formData: FormData) {
  const raw = formToObject(formData);
  const parsed = GuardarSegmentoSchema.safeParse({
    nombre: raw.nombre,
    filtros: {
      sexo: raw.sexo,
      edadMin: raw.edadMin,
      edadMax: raw.edadMax,
      barrio: raw.barrio,
      healthMin: raw.healthMin,
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
  await saveSegment(parsed.data.nombre, parsed.data.filtros, email ?? undefined);
  revalidatePath("/segmentos");
  redirect("/segmentos?guardado=1");
}

export async function borrarSegmento(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const seg = await getSavedSegment(id);
  if (!seg) return;
  await deleteSegment(id);
  revalidatePath("/segmentos");
}
