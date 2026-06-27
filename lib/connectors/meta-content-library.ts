// Conector de listening: Meta Content Library (Plan 05 F2).
// Reemplazo oficial de CrowdTangle para investigación académica. Cubre
// posts FB públicos, Reels IG públicos y comentarios. Requiere aprobación
// research (~2-4 semanas) → mientras tanto corre 100% mock para que
// /escucha ya muestre la fuente y la swap a real sea trivial.
//
// Doc: https://transparency.meta.com/researchtools/meta-content-library
//
// Geo: si la API tiene `lat/lng/radius_km` los pasamos; sino caemos a
// keyword + filtro local sobre lat/lng de cada item cuando vienen.
import type {
  ConnectorStatus,
  ListenItem,
  ListenQuery,
  ListeningConnector,
  TestResult,
} from "./types";
import { META_MOCK_PARENTS, mockMetaItems } from "@/lib/mock/listening-meta";
import { demoData } from "@/lib/connectors/demo";
import { getConnectorConfig } from "./config";
import { log } from "@/lib/logger";
import { fetchWithTimeout } from "@/lib/net/safe-fetch";

const ENDPOINT = "https://content-library.meta.com/v1/search";

interface MetaApiResult {
  platform?: "instagram" | "facebook";
  content_type?: "post" | "reel" | "comment";
  caption?: string;
  comment_text?: string;
  page_name?: string;
  creator_handle?: string;
  commenter_handle?: string;
  post_url?: string;
  reel_url?: string;
  parent_post_url?: string;
  created_at?: string;
  location?: { lat?: number; lng?: number };
}

interface MetaApiResponse {
  results?: MetaApiResult[];
}

// Earth radius km. Filtro geo simple cuando la API entrega location pero
// no respeta el bbox que mandamos.
const EARTH_KM = 6371;
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
}

function matchesKeywords(text: string, q: ListenQuery): boolean {
  if (!q.keywords.length) return true;
  const t = text.toLowerCase();
  return q.keywords.some((k) => t.includes(k.toLowerCase()));
}

// Aplica geo-fence sobre items mock (la API real ya filtra server-side).
// El parent declara lat/lng. Comments heredan la posición del padre vía
// parentUrl — entran si el parent entra.
function filterMockByGeo(
  items: ListenItem[],
  query: ListenQuery,
): ListenItem[] {
  if (query.lat == null || query.lng == null) return items;
  const radius = query.radioKm ?? 25;
  const allowedParentUrls = new Set<string>();
  for (const p of META_MOCK_PARENTS) {
    if (p.lat == null || p.lng == null) continue;
    const d = haversineKm(query.lat, query.lng, p.lat, p.lng);
    if (d <= radius) {
      allowedParentUrls.add(`https://example.com/${p.source}/${p.id}`);
    }
  }
  return items.filter((i) => {
    const parentUrl = i.parentUrl ?? i.url;
    return parentUrl ? allowedParentUrls.has(parentUrl) : false;
  });
}

function mapApiResult(r: MetaApiResult): ListenItem | null {
  const text = r.caption ?? r.comment_text ?? "";
  if (!text) return null;
  const author =
    r.creator_handle ?? r.page_name ?? r.commenter_handle ?? undefined;
  const isComment = r.content_type === "comment";
  const url = isComment
    ? r.parent_post_url
    : (r.post_url ?? r.reel_url ?? r.parent_post_url);
  const platform = r.platform === "facebook" ? "meta-fb" : "meta-ig";
  const kind =
    r.content_type === "reel"
      ? "reel"
      : r.content_type === "comment"
        ? "comment"
        : "post";
  return {
    source: platform,
    text,
    url,
    kind,
    parentUrl: isComment ? r.parent_post_url : undefined,
    publishedAt: r.created_at,
    author,
    lat: r.location?.lat ?? null,
    lng: r.location?.lng ?? null,
  };
}

async function fetchReal(
  token: string,
  query: ListenQuery,
): Promise<ListenItem[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("token", token);
  url.searchParams.set("platform", "instagram,facebook");
  url.searchParams.set("content_type", "post,reel,comment");
  url.searchParams.set("date_range", "last_7_days");
  url.searchParams.set("limit", "200");
  // F4: pedir threaded comments (top 50 por post). Cada comment llega
  // como item independiente con parent_post_url referenciando al padre.
  url.searchParams.set("include_comments", "top_50");
  if (query.lat != null && query.lng != null) {
    url.searchParams.set("lat", String(query.lat));
    url.searchParams.set("lng", String(query.lng));
    url.searchParams.set("radius_km", String(query.radioKm ?? 25));
  }
  if (query.keywords.length) {
    url.searchParams.set("q", query.keywords.join(" OR "));
  }
  const res = await fetchWithTimeout(url.toString());
  if (!res.ok) throw new Error(`Meta CL HTTP ${res.status}`);
  const json = (await res.json()) as MetaApiResponse;
  return (json.results ?? [])
    .map(mapApiResult)
    .filter((x): x is ListenItem => x !== null);
}

export const metaContentLibraryConnector: ListeningConnector = {
  id: "meta-content-library",
  name: "Meta Content Library",
  vendor: "Meta Platforms, Inc.",
  category: "listening",
  description:
    "Posts FB / Reels IG / comentarios públicos por región (research API, requiere aprobación).",
  docsUrl:
    "https://transparency.meta.com/researchtools/meta-content-library",
  iconEmoji: "📘",
  capabilities: [
    { id: "meta.posts.fetch_geo", label: "Posts/Reels por geo" },
    { id: "meta.comments.fetch", label: "Comentarios públicos" },
  ],
  configSchema: [
    {
      key: "META_CL_TOKEN",
      label: "Content Library API token",
      type: "secret",
      required: true,
      help: "Token de acceso obtenido tras aprobación research (2-4 semanas).",
    },
    {
      key: "META_CL_ACCOUNT_ID",
      label: "Researcher account ID",
      type: "text",
      required: true,
      help: "ID de la cuenta de investigador asociada al token.",
    },
  ],

  async test(): Promise<TestResult> {
    const cfg = await getConnectorConfig("meta-content-library");
    if (!cfg.META_CL_TOKEN) {
      return {
        ok: true,
        message:
          "Modo mock — pendiente de aprobación research. Items simulados de IG/FB.",
        details: { mode: "mock" },
      };
    }
    try {
      const probe = await fetchReal(cfg.META_CL_TOKEN, {
        keywords: ["test"],
      });
      return {
        ok: true,
        message: `Conexión OK · ${probe.length} items en probe.`,
        details: { mode: "real" },
      };
    } catch (err) {
      return {
        ok: false,
        message: `Error conectando: ${(err as Error).message}`,
        details: { mode: "real" },
      };
    }
  },

  async getStatus(): Promise<ConnectorStatus> {
    const cfg = await getConnectorConfig("meta-content-library");
    return cfg.META_CL_TOKEN ? "enabled" : "configuring";
  },

  async fetch(query: ListenQuery): Promise<ListenItem[]> {
    const cfg = await getConnectorConfig("meta-content-library");
    if (!cfg.META_CL_TOKEN) {
      if (!demoData()) return [];
      const items = mockMetaItems("all").filter((i) =>
        matchesKeywords(i.text, query),
      );
      return filterMockByGeo(items, query);
    }
    try {
      const real = await fetchReal(cfg.META_CL_TOKEN, query);
      log.debug("listening.meta.fetch", { count: real.length });
      return real.filter((i) => matchesKeywords(i.text, query));
    } catch (e) {
      log.warn("listening.meta.fetch_failed", {
        error: (e as Error).message,
      });
      if (!demoData()) return [];
      const items = mockMetaItems("all").filter((i) =>
        matchesKeywords(i.text, query),
      );
      return filterMockByGeo(items, query);
    }
  },
};
