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

// Sufijo determinístico para ids mock (sin Date.now para no romper purity en
// contextos donde no está disponible; basta con algo estable por contenido).
function idStamp(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
