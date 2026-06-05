"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getEncuestaBySlug } from "@/lib/encuestas";
import { addEncuestaResponse } from "@/lib/encuestas/responses";
import { parseAnswers } from "@/lib/encuestas/answer-parse";

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function responderPublica(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const enc = await getEncuestaBySlug(slug);
  if (!enc || enc.estado !== "publicada") {
    redirect(`/e/${slug}?error=1`);
  }

  // Dedupe blando "1 por navegador": si ya tiene la cookie, no re-cuenta.
  const cookieStore = await cookies();
  if (cookieStore.get(`enc_done_${enc.id}`)?.value === "1") {
    redirect(`/e/${slug}?gracias=1`);
  }

  const parsed = parseAnswers(enc.preguntas, formData);
  if (!parsed.ok) {
    redirect(`/e/${slug}?error=1&detalle=${encodeURIComponent(parsed.error)}`);
  }

  await addEncuestaResponse({
    projectId: enc.projectId,
    encuestaId: enc.id,
    source: "publica",
    answers: parsed.answers,
  });

  cookieStore.set(`enc_done_${enc.id}`, "1", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: ONE_YEAR,
    path: "/",
  });
  redirect(`/e/${slug}?gracias=1`);
}
