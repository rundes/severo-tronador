"use server";

import { redirect } from "next/navigation";
import { createTemplate } from "@/lib/templates";
import type { Channel } from "@/lib/relationship";

const CHANNELS: Channel[] = ["email", "whatsapp", "sms", "voice"];

export async function nuevaPlantilla(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const asunto = String(formData.get("asunto") ?? "").trim();
  const cuerpo = String(formData.get("cuerpo") ?? "").trim();
  const chRaw = String(formData.get("channel") ?? "") as Channel;
  const channel: Channel = CHANNELS.includes(chRaw) ? chRaw : "email";
  if (!nombre || !cuerpo) redirect("/templates?error=campos");

  await createTemplate({
    channel,
    nombre,
    asunto: channel === "email" ? asunto || undefined : undefined,
    cuerpo,
    estado: "activo",
  });
  redirect("/templates");
}
