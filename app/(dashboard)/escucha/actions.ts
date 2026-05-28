"use server";
import { revalidatePath } from "next/cache";
import { saveListeningConfig } from "@/lib/listening-config";

export async function guardarEscucha(formData: FormData) {
  const keywords = String(formData.get("keywords") ?? "")
    .split("\n").map((k) => k.trim()).filter(Boolean);
  const fuentes = formData.getAll("fuentes").map(String);
  const radioRaw = String(formData.get("radioKm") ?? "").trim();
  const radioKm = radioRaw && !Number.isNaN(Number(radioRaw)) ? Number(radioRaw) : null;
  await saveListeningConfig({
    zona: String(formData.get("zona") ?? "").trim(),
    pais: String(formData.get("pais") ?? "AR").trim() || "AR",
    radioKm,
    keywords,
    fuentes,
  });
  revalidatePath("/escucha");
}
