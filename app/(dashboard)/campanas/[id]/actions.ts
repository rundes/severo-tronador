"use server";

import { redirect } from "next/navigation";
import {
  signShareToken,
  SHARE_DURATIONS,
} from "@/lib/share-token";
import { logAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";

export async function generarShareLink(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const duracion = String(formData.get("duracion") ?? "week") as
    | "day"
    | "week"
    | "month";
  if (!id) return;
  const ms = SHARE_DURATIONS[duracion] ?? SHARE_DURATIONS.week;
  const exp = Date.now() + ms;
  const token = signShareToken({ t: "campaign", id, exp });

  const session = await auth();
  await logAudit({
    action: "campaign.create",
    actor: session?.user?.email ?? null,
    entity_type: "share_link",
    entity_id: id,
    details: { duracion, exp_iso: new Date(exp).toISOString() },
  });

  redirect(`/campanas/${id}?shared=${token}&exp=${exp}`);
}
