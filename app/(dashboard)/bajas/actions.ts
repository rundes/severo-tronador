"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { optOut, isOptedOut, revokeOptOut } from "@/lib/optout";
import { logAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { requireMember } from "@/lib/workspace";

export async function crearBaja(formData: FormData) {
  const dni = String(formData.get("dni") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!dni || !/^\d{6,9}$/.test(dni)) redirect("/bajas?error=dni");
  const { id: projectId } = await requireMember("editor");

  if (await isOptedOut(projectId, dni)) redirect("/bajas?error=ya_existe");
  await optOut(projectId, dni, reason ? `manual: ${reason}` : "manual");
  await logAudit({
    action: "optout.create",
    projectId,
    actor: (await auth())?.user?.email ?? null,
    entity_type: "contact",
    entity_id: dni,
    details: reason ? { reason } : {},
  });
  revalidatePath("/bajas");
  redirect("/bajas?ok=alta");
}

export async function revocarBaja(formData: FormData) {
  const dni = String(formData.get("dni") ?? "").trim();
  if (!dni) redirect("/bajas?error=dni");
  const { id: projectId } = await requireMember("editor");

  const { revoked } = await revokeOptOut(projectId, dni);
  if (revoked) {
    await logAudit({
      action: "optout.revoke",
      projectId,
      actor: (await auth())?.user?.email ?? null,
      entity_type: "contact",
      entity_id: dni,
      details: {},
    });
  }
  revalidatePath("/bajas");
  redirect(revoked ? "/bajas?ok=revocada" : "/bajas?error=no_existe");
}
