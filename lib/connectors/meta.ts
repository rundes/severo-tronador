// Conector publishing: Meta Graph API (Facebook Page + Instagram + Ads).
// Permite publicar avisos/contenido en una Página de Facebook y/o cuenta de
// Instagram Business, y promocionar (boost) un post vía Marketing API.
//
// Sin META_ACCESS_TOKEN corre en modo mock (no publica, devuelve ids falsos),
// suficiente para probar el flujo de la UI sin credenciales reales.
import type {
  Config,
  ConnectorStatus,
  TestResult,
  Connector,
} from "./types";
import { getConnectorConfig } from "./config";

const ID = "meta";
const GRAPH = "https://graph.facebook.com/v21.0";

export const metaConnector: Connector = {
  id: ID,
  name: "Meta (Facebook / Instagram)",
  vendor: "Meta Platforms",
  category: "publishing",
  description:
    "Publicar avisos y contenido en una Página de Facebook e Instagram, y promocionarlos (ads).",
  docsUrl: "https://developers.facebook.com/docs/pages-api",
  iconEmoji: "📣",

  capabilities: [
    { id: "meta.page_post", label: "Publicar en Página de Facebook" },
    { id: "meta.ig_post", label: "Publicar en Instagram" },
    { id: "meta.promote", label: "Promocionar (ads)" },
  ],

  configSchema: [
    {
      key: "META_ACCESS_TOKEN",
      label: "Access Token",
      type: "secret",
      required: true,
      placeholder: "EAAB…",
      help: "Token de acceso de Página (long-lived) con permisos pages_manage_posts, pages_read_engagement, instagram_basic, instagram_content_publish y ads_management (para promocionar).",
    },
    {
      key: "META_PAGE_ID",
      label: "ID de la Página de Facebook",
      type: "text",
      required: true,
      placeholder: "1234567890",
    },
    {
      key: "META_IG_USER_ID",
      label: "ID de cuenta de Instagram Business",
      type: "text",
      required: false,
      placeholder: "17841400000000000",
      help: "Opcional. Necesario para publicar en Instagram.",
    },
    {
      key: "META_AD_ACCOUNT_ID",
      label: "ID de cuenta publicitaria",
      type: "text",
      required: false,
      placeholder: "act_1234567890",
      help: "Opcional. Necesario para promocionar publicaciones (ads).",
    },
  ],

  async test(config?: Config): Promise<TestResult> {
    const cfg = config ?? (await getConnectorConfig(ID));
    if (!cfg.META_ACCESS_TOKEN || !cfg.META_PAGE_ID) {
      return {
        ok: true,
        message: "Modo mock — falta Access Token o ID de Página.",
      };
    }
    try {
      const res = await fetch(
        `${GRAPH}/${cfg.META_PAGE_ID}?fields=name&access_token=${encodeURIComponent(
          cfg.META_ACCESS_TOKEN,
        )}`,
      );
      const data = (await res.json()) as {
        name?: string;
        error?: { message?: string };
      };
      if (!res.ok || data.error) {
        return {
          ok: false,
          message: `Meta API error: ${data.error?.message ?? `HTTP ${res.status}`}`,
        };
      }
      return {
        ok: true,
        message: `Conectado a la Página «${data.name ?? cfg.META_PAGE_ID}».`,
        details: { page: data.name ?? null },
      };
    } catch (err) {
      return { ok: false, message: `Error conectando a Meta: ${(err as Error).message}` };
    }
  },

  async getStatus(config?: Config): Promise<ConnectorStatus> {
    const cfg = config ?? (await getConnectorConfig(ID));
    return cfg.META_ACCESS_TOKEN && cfg.META_PAGE_ID ? "enabled" : "configuring";
  },
};
