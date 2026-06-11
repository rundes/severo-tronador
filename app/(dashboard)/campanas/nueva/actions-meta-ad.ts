"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { enqueueSheetSync } from "@/lib/db/mirror";
import { logAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { requireMember } from "@/lib/workspace";
import { createAndPopulateAudience } from "@/lib/meta-custom-audiences";
import { getMetaConfig } from "@/lib/meta";
import {
  buildCreativeSpec,
  createCampaign,
  createAdset,
  createAdFromProposal,
  uploadAdVideo,
  type ProposalMedia,
} from "@/lib/meta-ads";

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

// Fase 2 (end-to-end): crea un anuncio Meta PAUSED que TARGETEA la Custom
// Audience de la campaña (creada desde el segmento). Cierra el loop
// segmento → audiencia → aviso → tracking. Reusa la maquinaria de meta-ads.
export async function crearAnuncioConAudiencia(formData: FormData) {
  const { id: projectId } = await requireMember("editor");
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  if (!campaignId) redirect("/campanas");
  if (!dbConfigured()) redirect(`/campanas/${campaignId}?ad_error=no_db`);

  const mensaje = String(formData.get("mensaje") ?? "").trim();
  const imageUrl = String(formData.get("imageUrl") ?? "").trim();
  const videoUrl = String(formData.get("videoUrl") ?? "").trim();
  const link = String(formData.get("link") ?? "").trim();
  const cta = String(formData.get("cta") ?? "LEARN_MORE").trim();
  const presupuesto = Number(formData.get("presupuesto") ?? 5);
  const dias = Number(formData.get("dias") ?? 7);
  const pais = (String(formData.get("pais") ?? "AR").trim().toUpperCase() || "AR").slice(0, 2);

  if (!mensaje) redirect(`/campanas/${campaignId}?ad_error=sin_mensaje`);
  if (!/^https?:\/\//i.test(link)) redirect(`/campanas/${campaignId}?ad_error=link`);
  if (!imageUrl && !videoUrl) redirect(`/campanas/${campaignId}?ad_error=sin_media`);

  const sb = getSupabase();
  const { data: camp } = await sb
    .from("campanas")
    .select("id, nombre, meta_audience_id")
    .eq("id", campaignId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!camp) redirect(`/campanas/${campaignId}?ad_error=no_existe`);
  if (!camp.meta_audience_id) redirect(`/campanas/${campaignId}?ad_error=sin_audiencia`);

  const { pageId } = await getMetaConfig();
  if (!pageId) redirect(`/campanas/${campaignId}?ad_error=sin_pagina`);

  // El trabajo va en try; los redirects van AFUERA (redirect() lanza
  // NEXT_REDIRECT y un catch lo atraparía).
  let media: ProposalMedia = {
    imageUrl: imageUrl || undefined,
    videoUrl: videoUrl || undefined,
  };
  let adId: string | undefined;
  let adsetId: string | undefined;
  let metaCampId: string | undefined;
  let errMsg: string | null = null;
  try {
    if (videoUrl) {
      const up = await uploadAdVideo(videoUrl);
      if (!up.ok) errMsg = up.error ?? "No se pudo subir el video.";
      else media = { ...media, videoId: up.videoId };
    }
    if (!errMsg) {
      const spec = buildCreativeSpec(media, { pageId: pageId!, link, cta, message: mensaje });
      const metaCamp = await createCampaign({ name: `Tronador · ${camp.nombre}`, objective: "OUTCOME_TRAFFIC" });
      metaCampId = metaCamp.id;
      const adset = await createAdset({
        campaignId: metaCamp.id,
        name: `${camp.nombre} · conjunto`,
        dailyBudgetUsd: presupuesto > 0 ? presupuesto : 5,
        days: dias > 0 ? dias : 7,
        countries: [pais],
        nowMs: Date.now(),
        customAudienceId: camp.meta_audience_id as string,
      });
      adsetId = adset.id;
      const ad = await createAdFromProposal({ adsetId: adset.id, spec, name: `Tronador · ${camp.nombre}` });
      if (!ad.ok) errMsg = ad.error ?? "No se pudo crear el anuncio.";
      else adId = ad.id;
    }
  } catch (e) {
    errMsg = (e as Error).message;
  }

  if (errMsg) redirect(`/campanas/${campaignId}?ad_error=${encodeURIComponent(errMsg)}`);

  await sb
    .from("campanas")
    .update({ meta_ad_id: adId, meta_adset_id: adsetId, meta_campaign_id: metaCampId })
    .eq("id", campaignId);
  await logAudit({
    action: "ad.create",
    projectId,
    actor: (await auth())?.user?.email ?? null,
    entity_type: "ad",
    entity_id: adId,
    details: { from: "campana-audiencia", campaignId, customAudienceId: camp.meta_audience_id },
  });
  revalidatePath(`/campanas/${campaignId}`);
  redirect(`/campanas/${campaignId}?ad_ok=1`);
}
