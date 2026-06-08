// Conector de listening: Meta Ad Library (biblioteca de anuncios).
// Lee anuncios PÚBLICOS que están corriendo en Meta (transparencia), filtrados
// por país + términos. Útil para monitorear pauta política/de tema social.
// Reusa el token del conector `meta` (META_ACCESS_TOKEN). Sin token → vacío.
//
// Endpoint: GET https://graph.facebook.com/v21.0/ads_archive
//   search_terms, ad_reached_countries=["AR"], ad_type, ad_active_status=ALL
import type {
  ConnectorStatus,
  ListenItem,
  ListenQuery,
  ListeningConnector,
  TestResult,
} from "./types";
import { getConnectorConfig } from "./config";
import { log } from "@/lib/logger";

const GRAPH = "https://graph.facebook.com/v21.0";
const LIMIT = 100;
// POLITICAL_AND_ISSUE_ADS trae gasto/impresiones/demografía (lo más rico para
// investigación electoral). Override con META_AD_TYPE=ALL para todos los rubros.
const DEFAULT_AD_TYPE = "POLITICAL_AND_ISSUE_ADS";

interface ArchiveAd {
  id?: string;
  page_name?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_delivery_start_time?: string;
  ad_snapshot_url?: string;
  spend?: { lower_bound?: string; upper_bound?: string };
  impressions?: { lower_bound?: string; upper_bound?: string };
}

function rangeStr(r?: { lower_bound?: string; upper_bound?: string }): string {
  if (!r) return "";
  const lo = r.lower_bound ?? "?";
  const hi = r.upper_bound ?? "?";
  return `${lo}–${hi}`;
}

export const metaAdLibraryConnector: ListeningConnector = {
  id: "meta-ad-library",
  name: "Meta Ad Library",
  vendor: "Meta Platforms",
  category: "listening",
  description: "Anuncios públicos que corren en Meta (transparencia / pauta política).",
  docsUrl: "https://www.facebook.com/ads/library/api/",
  iconEmoji: "🗂️",
  capabilities: [
    { id: "ads.fetch_political", label: "Anuncios políticos por país/término" },
  ],
  configSchema: [],

  async test(): Promise<TestResult> {
    const cfg = await getConnectorConfig("meta");
    return cfg.META_ACCESS_TOKEN
      ? { ok: true, message: "Usa el token del conector Meta." }
      : { ok: true, message: "Falta META_ACCESS_TOKEN (conector Meta) — devuelve vacío." };
  },
  async getStatus(): Promise<ConnectorStatus> {
    const cfg = await getConnectorConfig("meta");
    return cfg.META_ACCESS_TOKEN ? "enabled" : "configuring";
  },

  async fetch(query: ListenQuery): Promise<ListenItem[]> {
    const meta = await getConnectorConfig("meta");
    const token = meta.META_ACCESS_TOKEN;
    if (!token) return [];

    const terms = (query.keywords ?? []).join(" ").trim();
    if (!terms) return []; // ads_archive requiere search_terms (o page ids)
    const country = (query.pais || "AR").toUpperCase().slice(0, 2);
    const adType = process.env.META_AD_TYPE || DEFAULT_AD_TYPE;

    const params = new URLSearchParams({
      search_terms: terms,
      ad_reached_countries: JSON.stringify([country]),
      ad_type: adType,
      ad_active_status: "ALL",
      limit: String(LIMIT),
      fields:
        "id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_delivery_start_time,ad_snapshot_url,spend,impressions",
      access_token: token,
    });
    try {
      const res = await fetch(`${GRAPH}/ads_archive?${params}`);
      const json = (await res.json()) as { data?: ArchiveAd[]; error?: { message?: string } };
      if (!res.ok || json.error) {
        throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      }
      return (json.data ?? []).map((a) => {
        const body =
          a.ad_creative_bodies?.[0] ?? a.ad_creative_link_titles?.[0] ?? "(anuncio sin texto)";
        const metricsLine = [
          a.spend ? `gasto ${rangeStr(a.spend)}` : "",
          a.impressions ? `impres. ${rangeStr(a.impressions)}` : "",
        ].filter(Boolean).join(" · ");
        return {
          source: "Meta Ads",
          text: metricsLine ? `${body}\n[${metricsLine}]` : body,
          url: a.ad_snapshot_url,
          publishedAt: a.ad_delivery_start_time,
          author: a.page_name,
          kind: "post" as const,
        };
      });
    } catch (e) {
      log.warn("listening.meta_ad_library.fetch_failed", { error: (e as Error).message });
      return [];
    }
  },
};
