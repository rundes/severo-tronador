"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { saveListeningConfig } from "@/lib/listening-config";
import { dbConfigured } from "@/lib/db/supabase";
import { GuardarEscuchaSchema, formToObject } from "@/lib/schemas";

export async function guardarEscucha(formData: FormData) {
  // Sin Supabase la config no puede persistir. Redirigimos con flag para que
  // la UI muestre el estado en banner, en vez de throw → error boundary.
  if (!dbConfigured()) redirect("/escucha?error=no_db");

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
  if (!parsed.success) redirect("/escucha?error=validacion");

  await saveListeningConfig(parsed.data);
  revalidatePath("/escucha");
  redirect("/escucha?guardado=1");
}
