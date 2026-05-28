"use server";

import { revalidatePath } from "next/cache";
import { addManualCall } from "@/lib/calls";
import { RegistrarLlamadaSchema, formToObject } from "@/lib/schemas";

export async function registrarLlamada(formData: FormData) {
  const parsed = RegistrarLlamadaSchema.safeParse(formToObject(formData));
  if (!parsed.success) return;
  await addManualCall(parsed.data);
  revalidatePath(`/contactos/${parsed.data.dni}`);
}
