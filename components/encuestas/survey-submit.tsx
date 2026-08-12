"use client";

// Botón de envío de la encuesta pública con estado pending: sin esto un doble
// tap (común en móvil) despachaba la action dos veces y duplicaba la
// respuesta en el dataset.

import { useFormStatus } from "react-dom";

export function SurveySubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="sticky bottom-3 w-full rounded-xl bg-[oklch(52%_0.13_255)] px-4 py-3.5 text-base font-semibold text-white shadow-md transition hover:bg-[oklch(47%_0.13_255)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? "Enviando…" : "Enviar respuesta"}
    </button>
  );
}
