"use server";

import { revalidatePath } from "next/cache";
import { addManualCall, CALL_OUTCOMES, type CallOutcome } from "@/lib/calls";

export async function registrarLlamada(formData: FormData) {
  const dni = String(formData.get("dni") ?? "").trim();
  const outcomeRaw = String(formData.get("outcome") ?? "") as CallOutcome;
  const notes = String(formData.get("notes") ?? "").trim();
  if (!dni) return;
  const valid = CALL_OUTCOMES.some((o) => o.value === outcomeRaw);
  if (!valid) return;

  await addManualCall({ dni, outcome: outcomeRaw, notes: notes || undefined });
  revalidatePath(`/contactos/${dni}`);
}
