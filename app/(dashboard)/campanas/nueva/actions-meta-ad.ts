"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { enqueueSheetSync } from "@/lib/db/mirror";
import { logAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { requireMember } from "@/lib/workspace";
import { createAndPopulateAudience } from "@/lib/meta-custom-audiences";

// Inserta directamente una fila en `campanas` para channel="meta-ad".
// No usa executeCampaign (que necesita un conector). No toca envios ni queue.
export async function crearCampanaMetaAd(formData: FormData) {
  const { id: projectId } = await requireMember("editor");

  const nombre = String(formData.get("nombre") ?? "").trim();
  const segmentId = String(formData.get("segmentId") ?? "").trim();
  const adSource = String(formData.get("adSource") ?? "").trim(); // "vincular" | "crear"
  const metaAdId = String(formData.get("metaAdId") ?? "").trim();
  const metaAdsetId = String(formData.get("metaAdsetId") ?? "").trim();
  const metaCampaignId = String(formData.get("metaCampaignId") ?? "").trim();

  // Validaciones básicas.
  if (!nombre) {
    redirect("/campanas/nueva/meta-ad?error=nombre_requerido");
  }
  if (!segmentId) {
    redirect("/campanas/nueva/meta-ad?error=segmento_requerido");
  }
  if (adSource === "vincular" && !metaAdId) {
    redirect("/campanas/nueva/meta-ad?error=ad_id_requerido");
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const row = {
    id,
    project_id: projectId,
    nombre,
    channel: "meta-ad",
    // template_id no aplica a meta-ad (la columna es nullable en 0001_init.sql).
    template_id: null,
    segment_filter: {},
    variants: [],
    preguntas: [],
    encuesta_id: null,
    estado: "activa",
    metrics: { total: 0, sent: 0, failed: 0, skipped: 0 },
    created_at: now,
    segment_id: segmentId || null,
    meta_ad_id: metaAdId || null,
    meta_adset_id: metaAdsetId || null,
    meta_campaign_id: metaCampaignId || null,
    meta_audience_id: null,
  };

  if (dbConfigured()) {
    const { error } = await getSupabase().from("campanas").insert(row);
    if (error) {
      redirect(
        `/campanas/nueva/meta-ad?error=db&detalle=${encodeURIComponent(error.message)}`,
      );
    }
    await enqueueSheetSync("campanas", "upsert", row);
  }
  // En modo mock (sin Supabase) simplemente saltamos al detalle con el id
  // generado; no hay store en memoria para meta-ad, la página de detalle
  // mostrará un 404 en dev, que es aceptable para este flujo.

  const session = await auth();
  await logAudit({
    action: "campaign.meta_ad.create",
    projectId,
    actor: session?.user?.email ?? null,
    entity_type: "campaign",
    entity_id: id,
    details: {
      nombre,
      segmentId,
      metaAdId: metaAdId || "(pendiente)",
      adSource,
    },
  });

  redirect(`/campanas/${id}`);
}

// Fase 2: empuja el segmento de la campaña como Custom Audience de Meta
// (emails/teléfonos hasheados) y guarda el audience_id en la campaña.
export async function crearAudienciaSegmento(formData: FormData) {
  const { id: projectId } = await requireMember("editor");
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  if (!campaignId) redirect("/campanas");
  if (!dbConfigured()) redirect(`/campanas/${campaignId}?aud_error=no_db`);

  const sb = getSupabase();
  const { data: camp } = await sb
    .from("campanas")
    .select("id, nombre, segment_id")
    .eq("id", campaignId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!camp) redirect(`/campanas/${campaignId}?aud_error=no_existe`);
  if (!camp.segment_id) redirect(`/campanas/${campaignId}?aud_error=sin_segmento`);

  const r = await createAndPopulateAudience({
    projectId,
    segmentId: camp.segment_id as string,
    name: `Tronador · ${camp.nombre}`,
  });
  if (!r.ok) {
    redirect(`/campanas/${campaignId}?aud_error=${encodeURIComponent(r.error ?? "fallo")}`);
  }

  await sb.from("campanas").update({ meta_audience_id: r.audienceId }).eq("id", campaignId);
  await logAudit({
    action: "campaign.meta_ad.audience",
    projectId,
    actor: (await auth())?.user?.email ?? null,
    entity_type: "campaign",
    entity_id: campaignId,
    details: { audienceId: r.audienceId, matched: r.matched, total: r.total, mode: r.mode },
  });
  revalidatePath(`/campanas/${campaignId}`);
  redirect(
    `/campanas/${campaignId}?aud_ok=1&matched=${r.matched}&total=${r.total}&mode=${r.mode}`,
  );
}
