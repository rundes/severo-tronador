"use server";

import { redirect } from "next/navigation";
import { createTemplate } from "@/lib/templates";
import { NuevaPlantillaSchema, formToObject } from "@/lib/schemas";

export async function nuevaPlantilla(formData: FormData) {
  const parsed = NuevaPlantillaSchema.safeParse(formToObject(formData));
  if (!parsed.success) redirect("/templates?error=campos");

  await createTemplate({
    channel: parsed.data.channel,
    nombre: parsed.data.nombre,
    asunto: parsed.data.asunto,
    cuerpo: parsed.data.cuerpo,
    estado: "activo",
  });
  redirect("/templates");
}
