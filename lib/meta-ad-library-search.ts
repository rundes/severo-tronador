// Búsqueda en la Meta Ad Library (ads_archive) para análisis de competencia.
// Solo lectura. Reusa el endpoint del conector de listening pero devuelve los
// anuncios completos (no ListenItem) para la página /competencia.
//
// La API NO devuelve el creativo (imagen/video), solo `ad_snapshot_url` (link
// a la ficha del aviso). Métricas (gasto/impresiones/demografía) solo vienen
// con ad_type=POLITICAL_AND_ISSUE_ADS y en países soportados (AR incluido).
import { log } from "@/lib/logger";

const GRAPH = "https://graph.facebook.com/v21.0";

export type AdType = "POLITICAL_AND_ISSUE_ADS" | "ALL";
export type AdActiveStatus = "ACTIVE" | "INACTIVE" | "ALL";

export interface AdLibAd {
  id: string;
  pageName?: string;
  byline?: string;
  body?: string;
  title?: string;
  caption?: string;
  startTime?: string;
  stopTime?: string;
  snapshotUrl?: string;
  spend?: { lower?: string; upper?: string };
  impressions?: { lower?: string; upper?: string };
  currency?: string;
  platforms?: string[];
  audience?: { lower?: string; upper?: string };
}

export type AdSearchResult =
  | { ok: true; ads: AdLibAd[] }
  | { ok: false; error: string };

interface RawRange {
  lower_bound?: string;
  upper_bound?: string;
}
interface RawAd {
  id?: string;
  page_name?: string;
  bylines?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_captions?: string[];
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  ad_snapshot_url?: string;
  spend?: RawRange;
  impressions?: RawRange;
  currency?: string;
  publisher_platforms?: string[];
  estimated_audience_size?: RawRange;
}

function adLibraryToken(): string {
  return (
    process.env.META_AD_LIBRARY_TOKEN || process.env.META_ACCESS_TOKEN || ""
  );
}

const FIELDS = [
  "id",
  "page_name",
  "bylines",
  "ad_creative_bodies",
  "ad_creative_link_titles",
  "ad_creative_link_captions",
  "ad_delivery_start_time",
  "ad_delivery_stop_time",
  "ad_snapshot_url",
  "spend",
  "impressions",
  "currency",
  "publisher_platforms",
  "estimated_audience_size",
].join(",");

function range(r?: RawRange): { lower?: string; upper?: string } | undefined {
  if (!r) return undefined;
  return { lower: r.lower_bound, upper: r.upper_bound };
}

export async function searchAdLibrary(input: {
  terms: string;
  country?: string;
  dateMin?: string;
  dateMax?: string;
  adType?: AdType;
  activeStatus?: AdActiveStatus;
  limit?: number;
}): Promise<AdSearchResult> {
  const token = adLibraryToken();
  if (!token) {
    return {
      ok: false,
      error:
        "Falta META_AD_LIBRARY_TOKEN (o META_ACCESS_TOKEN). Configurá el token de la Ad Library.",
    };
  }
  const terms = input.terms.trim();
  if (!terms) return { ok: true, ads: [] };

  const country = (input.country || "AR").toUpperCase().slice(0, 2);
  const params = new URLSearchParams({
    search_terms: terms,
    ad_reached_countries: JSON.stringify([country]),
    ad_type: input.adType ?? "POLITICAL_AND_ISSUE_ADS",
    ad_active_status: input.activeStatus ?? "ALL",
    limit: String(Math.min(input.limit ?? 50, 100)),
    fields: FIELDS,
    access_token: token,
  });
  if (input.dateMin) params.set("ad_delivery_date_min", input.dateMin);
  if (input.dateMax) params.set("ad_delivery_date_max", input.dateMax);

  try {
    const res = await fetch(`${GRAPH}/ads_archive?${params}`, {
      cache: "no-store",
    });
    const json = (await res.json()) as {
      data?: RawAd[];
      error?: { message?: string };
    };
    if (!res.ok || json.error) {
      throw new Error(json.error?.message ?? `HTTP ${res.status}`);
    }
    const ads: AdLibAd[] = (json.data ?? []).map((a) => ({
      id: a.id ?? a.ad_snapshot_url ?? crypto.randomUUID(),
      pageName: a.page_name,
      byline: a.bylines,
      body: a.ad_creative_bodies?.[0],
      title: a.ad_creative_link_titles?.[0],
      caption: a.ad_creative_link_captions?.[0],
      startTime: a.ad_delivery_start_time,
      stopTime: a.ad_delivery_stop_time,
      snapshotUrl: a.ad_snapshot_url,
      spend: range(a.spend),
      impressions: range(a.impressions),
      currency: a.currency,
      platforms: a.publisher_platforms,
      audience: range(a.estimated_audience_size),
    }));
    return { ok: true, ads };
  } catch (e) {
    const msg = (e as Error).message;
    log.warn("competencia.ad_library.search_failed", { terms, error: msg });
    if (/permission|library\/api|autorizaci|iniciar sesi|login/i.test(msg)) {
      return {
        ok: false,
        error:
          "El token todavía no está autorizado para la Ad Library API. Hay que completar la confirmación de identidad y los pasos en facebook.com/ads/library/api con la cuenta dueña del token.",
      };
    }
    return { ok: false, error: msg.slice(0, 300) };
  }
}
