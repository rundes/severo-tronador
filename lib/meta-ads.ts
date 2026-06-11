// Gestión de anuncios de la cuenta propia vía Meta Marketing API. Server-only.
// Mock-first: sin META_ACCESS_TOKEN/META_AD_ACCOUNT_ID devuelve datos
// determinísticos (mismo patrón que lib/meta.ts) para correr sin credenciales.
import { getMetaConfig, type Metric } from "@/lib/meta";

const GRAPH = "https://graph.facebook.com/v21.0";

export type DatePreset = "today" | "yesterday" | "last_7d" | "last_30d" | "maximum";
export type AdStatusFilter = "all" | "active" | "paused";

// Catálogo completo de ad_format soportados por generatepreviews/previews.
// "Todos los placements" del Estudio = este set.
export const AD_FORMATS = [
  "DESKTOP_FEED_STANDARD",
  "MOBILE_FEED_STANDARD",
  "INSTAGRAM_STANDARD",
  "INSTAGRAM_STORY",
  "INSTAGRAM_REELS",
  "FACEBOOK_STORY",
  "FACEBOOK_REELS",
  "MARKETPLACE_MOBILE",
  "RIGHT_COLUMN_STANDARD",
] as const;
export type AdFormat = (typeof AD_FORMATS)[number];

export type AdsMode = "mock" | "live";

export interface PreviewFrame {
  format: AdFormat;
  html: string;
}

function withAct(id: string): string {
  return id.startsWith("act_") ? id : `act_${id}`;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Sufijo determinístico para ids mock (sin Date.now, igual que lib/meta.ts).
function idStamp(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

async function graphGet(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${GRAPH}/${path}?${qs}`);
  const data = (await res.json()) as Record<string, unknown> & { error?: { message?: string } };
  if (!res.ok || data.error) throw new Error(data.error?.message ?? `Graph HTTP ${res.status}`);
  return data;
}

async function graphPost(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = (await res.json()) as Record<string, unknown> & { error?: { message?: string } };
  if (!res.ok || data.error) throw new Error(data.error?.message ?? `Graph HTTP ${res.status}`);
  return data;
}

// Reexport para consumidores que solo arman la grilla de KPIs.
export type { Metric };

export interface InsightsAction {
  action_type: string;
  value: string;
}
export interface InsightsRow {
  ad_id?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  clicks?: string;
  ctr?: string;
  spend?: string;
  cpc?: string;
  cpm?: string;
  actions?: InsightsAction[];
}

// Resultado por defecto a contar como "conversión". link_click es el universal
// para objetivos de tráfico/encuesta (la org hace relevamiento, no compras).
export const DEFAULT_RESULT_ACTION = "link_click";

function actionValue(row: InsightsRow, type: string): number {
  return num(row.actions?.find((a) => a.action_type === type)?.value);
}

// Traduce una fila de insights (level=ad) a la grilla de KPIs de la card.
// CPA y conversiones se derivan del action_type elegido (no vienen directos).
export function computeAdMetrics(row: InsightsRow, resultAction = DEFAULT_RESULT_ACTION): Metric[] {
  const spend = num(row.spend);
  const conversions = actionValue(row, resultAction);
  const cpa = conversions > 0 ? spend / conversions : 0;
  return [
    { label: "Impresiones", value: num(row.impressions) },
    { label: "Alcance", value: num(row.reach) },
    { label: "Frecuencia", value: num(row.frequency) },
    { label: "Clics", value: num(row.clicks) },
    { label: "CTR (%)", value: num(row.ctr) },
    { label: "Gasto (USD)", value: spend },
    { label: "CPC (USD)", value: num(row.cpc) },
    { label: "CPM (USD)", value: num(row.cpm) },
    { label: "Conversiones", value: conversions },
    { label: "CPA (USD)", value: Math.round(cpa * 100) / 100 },
  ];
}

export interface ProposalMedia {
  imageUrl?: string;
  videoUrl?: string;
  videoId?: string; // resultado de uploadAdVideo (requerido para usar video)
}

export interface CreativeSpec {
  page_id: string;
  link_data?: {
    message?: string;
    link: string;
    picture?: string;
    call_to_action?: { type: string; value: { link: string } };
  };
  video_data?: {
    message?: string;
    video_id: string;
    image_url?: string;
    call_to_action?: { type: string; value: { link: string } };
  };
}

export interface CreativeContext {
  pageId: string;
  link: string;
  cta: string; // CALL_TO_ACTION type, ej "LEARN_MORE"
  message?: string;
}

// Arma el object_story_spec. Si hay videoId usa video_data; si no, imagen por
// URL pública (link_data.picture) — evita subir la imagen a /adimages.
export function buildCreativeSpec(media: ProposalMedia, ctx: CreativeContext): CreativeSpec {
  const cta = { type: ctx.cta, value: { link: ctx.link } };
  if (media.videoId) {
    return {
      page_id: ctx.pageId,
      video_data: {
        message: ctx.message,
        video_id: media.videoId,
        ...(media.imageUrl ? { image_url: media.imageUrl } : {}),
        call_to_action: cta,
      },
    };
  }
  if (media.imageUrl) {
    return {
      page_id: ctx.pageId,
      link_data: { message: ctx.message, link: ctx.link, picture: media.imageUrl, call_to_action: cta },
    };
  }
  throw new Error("La propuesta necesita una imagen o video para armar el anuncio.");
}

export interface AdRow {
  id: string;
  name: string;
  status: string; // configured status (ACTIVE | PAUSED | ...)
  effectiveStatus: string; // effective_status de Meta
  campaign?: string;
  adset?: string;
  metrics: Metric[];
  mode: AdsMode;
}

interface AdNode {
  id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  adset?: { name?: string; campaign?: { name?: string } };
}

function matchesStatus(status: string, filter: AdStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return status === "ACTIVE";
  return status !== "ACTIVE";
}

// 3 filas mock determinísticas (1 pausada) con KPIs reales calculados.
function mockAds(status: AdStatusFilter): AdRow[] {
  const defs = [
    { id: "mock-ad-1", name: "Encuesta seguridad · video", status: "ACTIVE" },
    { id: "mock-ad-2", name: "Encuesta servicios · imagen", status: "ACTIVE" },
    { id: "mock-ad-3", name: "Invitación general", status: "PAUSED" },
  ];
  return defs
    .filter((d) => matchesStatus(d.status, status))
    .map((d) => {
      const seed = Math.abs([...d.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0));
      const imp = 2000 + (seed % 8000);
      const clicks = Math.round(imp * 0.03);
      const spend = Math.round(clicks * 0.2 * 100) / 100;
      const row: InsightsRow = {
        impressions: String(imp),
        reach: String(Math.round(imp * 0.7)),
        frequency: String(Math.round((imp / (imp * 0.7)) * 100) / 100),
        clicks: String(clicks),
        ctr: String(Math.round((clicks / imp) * 1000) / 10),
        spend: String(spend),
        cpc: String(clicks ? Math.round((spend / clicks) * 100) / 100 : 0),
        cpm: String(Math.round((spend / imp) * 1000 * 100) / 100),
        actions: [{ action_type: "link_click", value: String(clicks) }],
      };
      return {
        id: d.id,
        name: d.name,
        status: d.status,
        effectiveStatus: d.status,
        campaign: "Campaña (mock)",
        adset: "Conjunto (mock)",
        metrics: computeAdMetrics(row),
        mode: "mock" as const,
      };
    });
}

export async function listMyAds(opts: { datePreset?: DatePreset; status?: AdStatusFilter } = {}): Promise<AdRow[]> {
  const datePreset = opts.datePreset ?? "last_7d";
  const status = opts.status ?? "all";
  const { token, adAccountId } = await getMetaConfig();
  if (!token || !adAccountId) return mockAds(status);
  const acct = withAct(adAccountId);
  try {
    const adsData = await graphGet(`${acct}/ads`, {
      fields: "id,name,status,effective_status,adset{name,campaign{name}}",
      limit: "200",
      access_token: token,
    });
    const insData = await graphGet(`${acct}/insights`, {
      level: "ad",
      date_preset: datePreset,
      fields: "ad_id,impressions,reach,frequency,clicks,ctr,spend,cpc,cpm,actions",
      limit: "500",
      access_token: token,
    });
    const byAd = new Map<string, InsightsRow>();
    for (const r of (insData.data as InsightsRow[] | undefined) ?? []) {
      if (r.ad_id) byAd.set(r.ad_id, r);
    }
    const out: AdRow[] = [];
    for (const a of (adsData.data as AdNode[] | undefined) ?? []) {
      const st = a.status ?? "PAUSED";
      if (!matchesStatus(st, status)) continue;
      const id = a.id ?? "";
      out.push({
        id,
        name: a.name ?? id,
        status: st,
        effectiveStatus: a.effective_status ?? st,
        campaign: a.adset?.campaign?.name,
        adset: a.adset?.name,
        metrics: computeAdMetrics(byAd.get(id) ?? {}),
        mode: "live",
      });
    }
    return out;
  } catch {
    return mockAds(status);
  }
}

export interface StatusResult {
  ok: boolean;
  mode: AdsMode;
  status: "ACTIVE" | "PAUSED";
  error?: string;
}
export interface NamedRef {
  id: string;
  name: string;
}

const MOCK_PREVIEW_HTML =
  '<div style="font-family:system-ui;padding:16px;color:#71717a;font-size:13px;border:1px dashed #d4d4d8;border-radius:8px">Conectá Meta (Conectores → Meta) para ver el preview real del anuncio.</div>';

export async function setAdStatus(adId: string, status: "ACTIVE" | "PAUSED"): Promise<StatusResult> {
  const { token } = await getMetaConfig();
  if (!token || !adId) return { ok: true, mode: "mock", status };
  try {
    await graphPost(adId, { status, access_token: token });
    return { ok: true, mode: "live", status };
  } catch (e) {
    return { ok: false, mode: "live", status, error: (e as Error).message };
  }
}

export async function getAdPreview(adId: string, formats: AdFormat[]): Promise<PreviewFrame[]> {
  const { token } = await getMetaConfig();
  if (!token || !adId) return formats.map((format) => ({ format, html: MOCK_PREVIEW_HTML }));
  const out: PreviewFrame[] = [];
  for (const format of formats) {
    try {
      const data = await graphGet(`${adId}/previews`, { ad_format: format, access_token: token });
      const body = ((data.data as { body?: string }[] | undefined)?.[0]?.body) ?? "";
      out.push({ format, html: body || MOCK_PREVIEW_HTML });
    } catch {
      out.push({ format, html: MOCK_PREVIEW_HTML });
    }
  }
  return out;
}

export async function listCampaigns(): Promise<NamedRef[]> {
  const { token, adAccountId } = await getMetaConfig();
  if (!token || !adAccountId) return [{ id: "mock-camp-1", name: "Campaña (mock)" }];
  try {
    const data = await graphGet(`${withAct(adAccountId)}/campaigns`, {
      fields: "id,name,status",
      limit: "100",
      access_token: token,
    });
    return ((data.data as NamedRef[] | undefined) ?? []).map((c) => ({ id: c.id, name: c.name }));
  } catch {
    return [];
  }
}

export async function listAdsets(campaignId: string): Promise<NamedRef[]> {
  const { token } = await getMetaConfig();
  if (!token || !campaignId) return [{ id: "mock-adset-1", name: "Conjunto (mock)" }];
  try {
    const data = await graphGet(`${campaignId}/adsets`, {
      fields: "id,name,status",
      limit: "100",
      access_token: token,
    });
    return ((data.data as NamedRef[] | undefined) ?? []).map((a) => ({ id: a.id, name: a.name }));
  } catch {
    return [];
  }
}

export interface VideoUploadResult {
  ok: boolean;
  mode: AdsMode;
  videoId?: string;
  error?: string;
}
export interface CreateAdResult {
  ok: boolean;
  mode: AdsMode;
  id?: string;
  error?: string;
}

// Sube un video por URL a /advideos. No esperamos el procesamiento completo:
// para preview/creación PAUSED, Meta acepta el video_id apenas creado.
export async function uploadAdVideo(url: string): Promise<VideoUploadResult> {
  const { token, adAccountId } = await getMetaConfig();
  if (!token || !adAccountId || !url) return { ok: true, mode: "mock", videoId: `mock-vid-${idStamp(url)}` };
  try {
    const data = await graphPost(`${withAct(adAccountId)}/advideos`, { file_url: url, access_token: token });
    return { ok: true, mode: "live", videoId: String(data.id ?? "") };
  } catch (e) {
    return { ok: false, mode: "live", error: (e as Error).message };
  }
}

export async function previewProposal(spec: CreativeSpec, formats: AdFormat[]): Promise<PreviewFrame[]> {
  const { token, adAccountId } = await getMetaConfig();
  if (!token || !adAccountId) return formats.map((format) => ({ format, html: MOCK_PREVIEW_HTML }));
  const creative = JSON.stringify({ object_story_spec: spec });
  const out: PreviewFrame[] = [];
  for (const format of formats) {
    try {
      const data = await graphGet(`${withAct(adAccountId)}/generatepreviews`, {
        creative,
        ad_format: format,
        access_token: token,
      });
      const body = ((data.data as { body?: string }[] | undefined)?.[0]?.body) ?? "";
      out.push({ format, html: body || MOCK_PREVIEW_HTML });
    } catch {
      out.push({ format, html: MOCK_PREVIEW_HTML });
    }
  }
  return out;
}

export async function createCampaign(input: { name: string; objective: string }): Promise<{ id: string }> {
  const { token, adAccountId } = await getMetaConfig();
  if (!token || !adAccountId) return { id: `mock-camp-${idStamp(input.name)}` };
  const data = await graphPost(`${withAct(adAccountId)}/campaigns`, {
    name: input.name,
    objective: input.objective,
    status: "PAUSED",
    special_ad_categories: "[]",
    access_token: token,
  });
  return { id: String(data.id ?? "") };
}

export async function createAdset(input: {
  campaignId: string;
  name: string;
  dailyBudgetUsd: number;
  days: number;
  countries: string[];
  nowMs: number;
  // Fase 2: targetear una Custom Audience (segmento empujado como audiencia).
  customAudienceId?: string;
}): Promise<{ id: string }> {
  const { token, adAccountId } = await getMetaConfig();
  if (!token || !adAccountId) return { id: `mock-adset-${idStamp(input.name)}` };
  const endTime = Math.floor((input.nowMs + input.days * 86_400_000) / 1000);
  const targeting: Record<string, unknown> = { geo_locations: { countries: input.countries } };
  if (input.customAudienceId) targeting.custom_audiences = [{ id: input.customAudienceId }];
  const data = await graphPost(`${withAct(adAccountId)}/adsets`, {
    name: input.name,
    campaign_id: input.campaignId,
    daily_budget: String(Math.round(input.dailyBudgetUsd * 100)),
    billing_event: "IMPRESSIONS",
    optimization_goal: "LINK_CLICKS",
    targeting: JSON.stringify(targeting),
    end_time: String(endTime),
    status: "PAUSED",
    access_token: token,
  });
  return { id: String(data.id ?? "") };
}

// Crea el adcreative + ad en estado PAUSED dentro del conjunto elegido.
export async function createAdFromProposal(input: {
  adsetId: string;
  spec: CreativeSpec;
  name: string;
}): Promise<CreateAdResult> {
  const { token, adAccountId } = await getMetaConfig();
  if (!token || !adAccountId) return { ok: true, mode: "mock", id: `mock-ad-${idStamp(input.name)}` };
  const acct = withAct(adAccountId);
  try {
    const creative = await graphPost(`${acct}/adcreatives`, {
      name: `${input.name} · creative`,
      object_story_spec: JSON.stringify(input.spec),
      access_token: token,
    });
    const ad = await graphPost(`${acct}/ads`, {
      name: input.name,
      adset_id: input.adsetId,
      creative: JSON.stringify({ creative_id: String(creative.id) }),
      status: "PAUSED",
      access_token: token,
    });
    return { ok: true, mode: "live", id: String(ad.id ?? "") };
  } catch (e) {
    return { ok: false, mode: "live", error: (e as Error).message };
  }
}
