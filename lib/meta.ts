// Meta Graph API: publicaciones orgánicas (Facebook Page + Instagram) y
// promoción paga (Marketing API). Server-only. Sin credenciales del conector
// `meta` corre en modo mock (devuelve ids falsos), para probar el flujo.
import { getConnectorConfig } from "@/lib/connectors/config";

const GRAPH = "https://graph.facebook.com/v21.0";

export interface MetaConfig {
  token?: string;
  pageId?: string;
  igUserId?: string;
  adAccountId?: string;
}

export async function getMetaConfig(): Promise<MetaConfig> {
  const c = await getConnectorConfig("meta");
  return {
    token: c.META_ACCESS_TOKEN,
    pageId: c.META_PAGE_ID,
    igUserId: c.META_IG_USER_ID,
    adAccountId: c.META_AD_ACCOUNT_ID,
  };
}

export interface MetaResult {
  ok: boolean;
  id?: string;
  url?: string;
  error?: string;
  mode: "mock" | "live";
}

// POST a la Graph API con cuerpo form-urlencoded. Lanza con el mensaje de
// error de Meta si la respuesta no es 2xx.
async function graphPost(
  path: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = (await res.json()) as Record<string, unknown> & {
    error?: { message?: string };
  };
  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? `Graph HTTP ${res.status}`);
  }
  return data;
}

export interface PagePostInput {
  message: string;
  link?: string;
  imageUrl?: string;
}

// Publica en la Página de Facebook. Con imagen usa /photos; sin imagen /feed.
export async function publishToPage(input: PagePostInput): Promise<MetaResult> {
  const { token, pageId } = await getMetaConfig();
  if (!token || !pageId) {
    return { ok: true, id: `mock-fb-${idStamp(input.message)}`, mode: "mock" };
  }
  try {
    let data: Record<string, unknown>;
    if (input.imageUrl) {
      data = await graphPost(`${pageId}/photos`, {
        url: input.imageUrl,
        caption: input.message ?? "",
        access_token: token,
      });
    } else {
      data = await graphPost(`${pageId}/feed`, {
        message: input.message,
        ...(input.link ? { link: input.link } : {}),
        access_token: token,
      });
    }
    const id = String(data.post_id ?? data.id ?? "");
    return { ok: true, id, url: id ? `https://www.facebook.com/${id}` : undefined, mode: "live" };
  } catch (e) {
    return { ok: false, error: (e as Error).message, mode: "live" };
  }
}

export interface IgPostInput {
  imageUrl: string;
  caption?: string;
}

// Publica en Instagram (2 pasos: crear contenedor + publicar). Requiere imagen.
export async function publishToInstagram(input: IgPostInput): Promise<MetaResult> {
  const { token, igUserId } = await getMetaConfig();
  if (!token || !igUserId) {
    return { ok: true, id: `mock-ig-${idStamp(input.caption ?? "")}`, mode: "mock" };
  }
  if (!input.imageUrl) {
    return { ok: false, error: "Instagram requiere una imagen.", mode: "live" };
  }
  try {
    const container = await graphPost(`${igUserId}/media`, {
      image_url: input.imageUrl,
      caption: input.caption ?? "",
      access_token: token,
    });
    const creationId = String(container.id ?? "");
    const published = await graphPost(`${igUserId}/media_publish`, {
      creation_id: creationId,
      access_token: token,
    });
    return { ok: true, id: String(published.id ?? ""), mode: "live" };
  } catch (e) {
    return { ok: false, error: (e as Error).message, mode: "live" };
  }
}

export interface PromoteInput {
  postId: string;
  dailyBudgetUsd: number;
  days: number;
  countries: string[]; // ISO-2, ej ["AR"]
  // Marca de tiempo para start/end (ms). Se pasa desde el caller (server action)
  // porque Date.now() no está disponible en algunos contextos del runtime.
  nowMs: number;
}

// Promociona (boost) un post existente de la Página vía Marketing API.
// Crea campaña + ad set + creative + ad en estado PAUSED: NO gasta hasta que
// se active manualmente en el Administrador de anuncios de Meta (seguridad).
export async function promotePagePost(input: PromoteInput): Promise<MetaResult> {
  const { token, adAccountId, pageId } = await getMetaConfig();
  if (!token || !adAccountId || !pageId) {
    return { ok: true, id: `mock-ad-${idStamp(input.postId)}`, mode: "mock" };
  }
  const acct = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  // object_story_id requiere formato {pageId}_{postId}. Si el postId ya lo trae
  // (publicado vía /feed), se usa tal cual.
  const storyId = input.postId.includes("_") ? input.postId : `${pageId}_${input.postId}`;
  const endTime = Math.floor((input.nowMs + input.days * 86_400_000) / 1000);
  try {
    const campaign = await graphPost(`${acct}/campaigns`, {
      name: `Promo ${input.postId}`,
      objective: "OUTCOME_ENGAGEMENT",
      status: "PAUSED",
      special_ad_categories: "[]",
      access_token: token,
    });
    const adset = await graphPost(`${acct}/adsets`, {
      name: `Promo ${input.postId} · adset`,
      campaign_id: String(campaign.id),
      daily_budget: String(Math.round(input.dailyBudgetUsd * 100)),
      billing_event: "IMPRESSIONS",
      optimization_goal: "POST_ENGAGEMENT",
      targeting: JSON.stringify({ geo_locations: { countries: input.countries } }),
      end_time: String(endTime),
      status: "PAUSED",
      access_token: token,
    });
    const creative = await graphPost(`${acct}/adcreatives`, {
      name: `Promo ${input.postId} · creative`,
      object_story_id: storyId,
      access_token: token,
    });
    const ad = await graphPost(`${acct}/ads`, {
      name: `Promo ${input.postId} · ad`,
      adset_id: String(adset.id),
      creative: JSON.stringify({ creative_id: String(creative.id) }),
      status: "PAUSED",
      access_token: token,
    });
    return { ok: true, id: String(ad.id ?? ""), mode: "live" };
  } catch (e) {
    return { ok: false, error: (e as Error).message, mode: "live" };
  }
}

export interface Metric {
  label: string;
  value: number;
}
export interface InsightsResult {
  ok: boolean;
  mode: "mock" | "live";
  metrics: Metric[];
  error?: string;
}

// Métricas de rendimiento de un post o un anuncio (medición ~en vivo vía
// Graph Insights). Mock determinístico sin credenciales.
export async function getInsights(
  kind: "post" | "ad",
  id: string,
): Promise<InsightsResult> {
  const { token } = await getMetaConfig();
  if (!token || !id) return mockInsights(kind, id);
  try {
    if (kind === "ad") {
      const res = await fetch(
        `${GRAPH}/${id}/insights?fields=impressions,reach,clicks,spend,ctr&access_token=${encodeURIComponent(token)}`,
      );
      const data = (await res.json()) as {
        data?: Record<string, string>[];
        error?: { message?: string };
      };
      if (!res.ok || data.error) throw new Error(data.error?.message ?? `HTTP ${res.status}`);
      const row = data.data?.[0] ?? {};
      return {
        ok: true,
        mode: "live",
        metrics: [
          { label: "Impresiones", value: num(row.impressions) },
          { label: "Alcance", value: num(row.reach) },
          { label: "Clics", value: num(row.clicks) },
          { label: "Gasto (USD)", value: num(row.spend) },
          { label: "CTR (%)", value: num(row.ctr) },
        ],
      };
    }
    const metrics = "post_impressions,post_impressions_unique,post_engaged_users,post_clicks";
    const res = await fetch(
      `${GRAPH}/${id}/insights?metric=${metrics}&access_token=${encodeURIComponent(token)}`,
    );
    const data = (await res.json()) as {
      data?: { name: string; values?: { value?: number }[] }[];
      error?: { message?: string };
    };
    if (!res.ok || data.error) throw new Error(data.error?.message ?? `HTTP ${res.status}`);
    const pick = (name: string) =>
      num(data.data?.find((d) => d.name === name)?.values?.[0]?.value);
    return {
      ok: true,
      mode: "live",
      metrics: [
        { label: "Impresiones", value: pick("post_impressions") },
        { label: "Alcance", value: pick("post_impressions_unique") },
        { label: "Personas que interactuaron", value: pick("post_engaged_users") },
        { label: "Clics", value: pick("post_clicks") },
      ],
    };
  } catch (e) {
    return { ok: false, mode: "live", metrics: [], error: (e as Error).message };
  }
}

function mockInsights(kind: "post" | "ad", id: string): InsightsResult {
  const seed = Math.abs(hashSeed(id || kind));
  const imp = 800 + (seed % 4000);
  const reach = Math.round(imp * 0.72);
  const clicks = Math.round(imp * 0.04);
  if (kind === "ad") {
    return {
      ok: true,
      mode: "mock",
      metrics: [
        { label: "Impresiones", value: imp },
        { label: "Alcance", value: reach },
        { label: "Clics", value: clicks },
        { label: "Gasto (USD)", value: Math.round(clicks * 0.12 * 100) / 100 },
        { label: "CTR (%)", value: Math.round((clicks / imp) * 1000) / 10 },
      ],
    };
  }
  return {
    ok: true,
    mode: "mock",
    metrics: [
      { label: "Impresiones", value: imp },
      { label: "Alcance", value: reach },
      { label: "Personas que interactuaron", value: Math.round(imp * 0.09) },
      { label: "Clics", value: clicks },
    ],
  };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// Sufijo determinístico para ids mock (sin Date.now para no romper purity en
// contextos donde no está disponible; basta con algo estable por contenido).
function idStamp(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
