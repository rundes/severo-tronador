"use server";

import { revalidatePath } from "next/cache";
import { addManualCall } from "@/lib/calls";
import { requireMember } from "@/lib/workspace";
import { RegistrarLlamadaSchema, formToObject } from "@/lib/schemas";

export async function registrarLlamada(formData: FormData) {
  // Guard obligatorio: las server actions se despachan por action-ID desde
  // cualquier ruta (incluidas las públicas) — sin esto escribía un anónimo.
  const { id: projectId } = await requireMember("editor");
  const parsed = RegistrarLlamadaSchema.safeParse(formToObject(formData));
  if (!parsed.success) return;
  await addManualCall(projectId, parsed.data);
  revalidatePath(`/contactos/${parsed.data.dni}`);
}
