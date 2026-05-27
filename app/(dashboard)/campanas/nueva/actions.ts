"use server";

import { redirect } from "next/navigation";
import { executeCampaign } from "@/lib/campaigns";
import { filterFromParams } from "@/lib/segments";

function str(v: FormDataEntryValue | null): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

export async function crearCampana(formData: FormData) {
  const nombre = str(formData.get("nombre")) ?? "Campaña sin nombre";
  const templateId = str(formData.get("templateId")) ?? "";
  const segmentFilter = filterFromParams({
    sexo: str(formData.get("sexo")),
    edadMin: str(formData.get("edadMin")),
    edadMax: str(formData.get("edadMax")),
    barrio: str(formData.get("barrio")),
    healthMin: str(formData.get("healthMin")),
  });

  const res = await executeCampaign({
    nombre,
    channel: "email",
    templateId,
    segmentFilter,
  });

  if (res.ok) redirect(`/campanas/${res.campaign.id}`);

  // Re-render del form con el motivo del bloqueo en la URL.
  const p = new URLSearchParams();
  for (const [k, v] of formData.entries()) {
    const s = String(v).trim();
    if (s && k !== "templateId") p.set(k, s);
  }
  p.set("error", res.reason);
  if (res.reason === "quota_blocked") {
    p.set("needed", String(res.needed));
    p.set("remaining", String(res.remaining));
  }
  redirect(`/campanas/nueva?${p}`);
}
