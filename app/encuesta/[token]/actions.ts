"use server";

import { redirect } from "next/navigation";
import { getCampaign } from "@/lib/campaigns";
import { addResponse, resolveToken } from "@/lib/survey";
import { optOut } from "@/lib/optout";
import { TokenSchema, formToObject } from "@/lib/schemas";

export async function responderEncuesta(formData: FormData) {
  const parsed = TokenSchema.safeParse(formToObject(formData));
  if (!parsed.success) redirect(`/encuesta/invalido?error=token`);
  const { token } = parsed.data;

  const ref = await resolveToken(token);
  if (!ref) redirect(`/encuesta/${token}?error=1`);

  const campaign = await getCampaign(ref.campaignId);
  const preguntas = campaign?.preguntas ?? [];
  const answers = preguntas
    .map((pregunta, i) => ({
      pregunta,
      respuesta: String(formData.get(`q${i}`) ?? "").trim(),
    }))
    .filter((a) => a.respuesta !== "");

  await addResponse(token, answers); // dedupe interno: una respuesta por token
  redirect(`/encuesta/${token}?gracias=1`);
}

export async function optarBaja(formData: FormData) {
  const parsed = TokenSchema.safeParse(formToObject(formData));
  if (!parsed.success) redirect(`/encuesta/invalido?error=token`);
  const { token } = parsed.data;

  const ref = await resolveToken(token);
  if (ref) await optOut(ref.dni, "baja desde encuesta");
  redirect(`/encuesta/${token}?baja=1`);
}
