"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { saveListeningConfig } from "@/lib/listening-config";
import { dbConfigured } from "@/lib/db/supabase";
import { requireMember } from "@/lib/workspace";
import { GuardarEscuchaSchema, formToObject } from "@/lib/schemas";

export async function guardarEscucha(formData: FormData) {
  // Sin Supabase la config no puede persistir. Redirigimos con flag para que
  // la UI muestre el estado en banner, en vez de throw → error boundary.
  if (!dbConfigured()) redirect("/escucha?error=no_db");
  const { id: projectId } = await requireMember("editor");

  const raw = formToObject(formData);
  const keywords = String(formData.get("keywords") ?? "")
    .split("\n")
    .map((k) => k.trim())
    .filter(Boolean);
  const fuentes = formData.getAll("fuentes").map(String);
  const rssFeeds = String(formData.get("rssFeeds") ?? "")
    .split("\n")
    .map((u) => u.trim())
    .filter(Boolean);

  const parsed = GuardarEscuchaSchema.safeParse({
    zona: raw.zona,
    pais: raw.pais,
    radioKm: raw.radioKm,
    lat: raw.lat,
    lng: raw.lng,
    keywords,
    fuentes,
    rssFeeds,
  });
  if (!parsed.success) redirect("/escucha?error=validacion");

  await saveListeningConfig(projectId, parsed.data);
  revalidatePath("/escucha");
  redirect("/escucha?guardado=1");
}
