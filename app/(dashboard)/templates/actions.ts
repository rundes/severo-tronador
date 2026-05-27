"use server";

import { redirect } from "next/navigation";
import { createTemplate } from "@/lib/templates";

export async function nuevaPlantilla(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const asunto = String(formData.get("asunto") ?? "").trim();
  const cuerpo = String(formData.get("cuerpo") ?? "").trim();
  if (!nombre || !cuerpo) redirect("/templates?error=campos");

  createTemplate({
    channel: "email",
    nombre,
    asunto: asunto || undefined,
    cuerpo,
    estado: "activo",
  });
  redirect("/templates");
}
