"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { requireMember } from "@/lib/workspace";
import { logAudit } from "@/lib/audit";
import {
  publishToPage,
  publishToInstagram,
  promotePagePost,
} from "@/lib/meta";

async function actorEmail(): Promise<string | null> {
  return (await auth())?.user?.email ?? null;
}

// Publica en Facebook y/o Instagram según los destinos elegidos.
export async function publicarPost(formData: FormData) {
  const { id: projectId } = await requireMember("editor");
  const mensaje = String(formData.get("mensaje") ?? "").trim();
  const link = String(formData.get("link") ?? "").trim();
  const imageUrl = String(formData.get("imageUrl") ?? "").trim();
  const targets = formData.getAll("targets").map(String);

  if (targets.length === 0) redirect("/publicaciones?error=targets");
  if (link && !/^https?:\/\//i.test(link)) redirect("/publicaciones?error=link");
  if (targets.includes("fb") && !mensaje && !imageUrl) {
    redirect("/publicaciones?error=fb_vacio");
  }
  if (targets.includes("ig") && !imageUrl) redirect("/publicaciones?error=ig_img");

  const out: { fb?: string; ig?: string } = {};
  let mode: "mock" | "live" = "mock";

  if (targets.includes("fb")) {
    const r = await publishToPage({
      message: mensaje,
      link: link || undefined,
      imageUrl: imageUrl || undefined,
    });
    if (!r.ok) {
      redirect(`/publicaciones?error=fb&detalle=${encodeURIComponent(r.error ?? "")}`);
    }
    out.fb = r.id;
    mode = r.mode;
  }
  if (targets.includes("ig")) {
    const r = await publishToInstagram({ imageUrl, caption: mensaje || undefined });
    if (!r.ok) {
      redirect(`/publicaciones?error=ig&detalle=${encodeURIComponent(r.error ?? "")}`);
    }
    out.ig = r.id;
    mode = r.mode;
  }

  await logAudit({
    action: "post.publish",
    projectId,
    actor: await actorEmail(),
    entity_type: "post",
    details: { targets, mode, ...out },
  });

  const qs = new URLSearchParams({ ok: "publicado", mode });
  if (out.fb) qs.set("fb", out.fb);
  if (out.ig) qs.set("ig", out.ig);
  revalidatePath("/publicaciones");
  redirect(`/publicaciones?${qs.toString()}`);
}

// Promociona (boost) un post de la Página. El ad se crea PAUSADO.
export async function promocionarPost(formData: FormData) {
  const { id: projectId } = await requireMember("editor");
  const postId = String(formData.get("postId") ?? "").trim();
  const presupuesto = Number(formData.get("presupuesto") ?? 0);
  const dias = Number(formData.get("dias") ?? 0);
  const pais = (String(formData.get("pais") ?? "AR").trim().toUpperCase() || "AR").slice(0, 2);

  if (!postId) redirect("/publicaciones?error=promo_post");
  if (!(presupuesto > 0) || !(dias > 0)) redirect("/publicaciones?error=promo_datos");

  const r = await promotePagePost({
    postId,
    dailyBudgetUsd: presupuesto,
    days: dias,
    countries: [pais],
    nowMs: Date.now(),
  });
  if (!r.ok) {
    redirect(`/publicaciones?error=promo&detalle=${encodeURIComponent(r.error ?? "")}`);
  }

  await logAudit({
    action: "post.promote",
    projectId,
    actor: await actorEmail(),
    entity_type: "ad",
    entity_id: r.id,
    details: { postId, presupuesto, dias, pais, mode: r.mode },
  });
  const qs = new URLSearchParams({ ok: "promocionado", mode: r.mode });
  if (r.id) qs.set("ad", r.id);
  revalidatePath("/publicaciones");
  redirect(`/publicaciones?${qs.toString()}`);
}
