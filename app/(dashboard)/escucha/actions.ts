"use server";
import { revalidatePath } from "next/cache";
import { saveListeningConfig } from "@/lib/listening-config";
import { GuardarEscuchaSchema, formToObject } from "@/lib/schemas";

export async function guardarEscucha(formData: FormData) {
  const raw = formToObject(formData);
  const keywords = String(formData.get("keywords") ?? "")
    .split("\n")
    .map((k) => k.trim())
    .filter(Boolean);
  const fuentes = formData.getAll("fuentes").map(String);

  const parsed = GuardarEscuchaSchema.safeParse({
    zona: raw.zona,
    pais: raw.pais,
    radioKm: raw.radioKm,
    keywords,
    fuentes,
  });
  if (!parsed.success) return;

  await saveListeningConfig(parsed.data);
  revalidatePath("/escucha");
}
