// Registry de conectores — discovery (ver ARCHITECTURE.md §2.3).
// F1: solo viven `data` (Google Sheets) y `auth` (Google OAuth). Cada fase
// siguiente suma un conector con un import + una línea acá, sin tocar el core.
import type { Connector } from "./types";
import { googleSheetsConnector } from "./google-sheets";
import { googleSheetsArchiveConnector } from "./google-sheets-archive";
import { googleOAuthConnector } from "./google-oauth";
import { resendConnector } from "./resend";
import { metaWaCloudConnector } from "./meta-wa-cloud";
import { telnyxSmsConnector } from "./telnyx-sms";
import { telnyxVoiceConnector } from "./telnyx-voice";
import { telegramBotConnector } from "./telegram-bot";
import { claudeApiConnector } from "./claude-api";
import { gdeltConnector } from "./gdelt";
import { xApiConnector } from "./x-api";
import { redditApiConnector } from "./reddit-api";

export const connectors: Connector[] = [
  googleSheetsConnector,
  googleSheetsArchiveConnector,
  googleOAuthConnector,
  resendConnector,
  metaWaCloudConnector,
  telnyxSmsConnector,
  telnyxVoiceConnector,
  telegramBotConnector,
  claudeApiConnector,
  gdeltConnector,
  xApiConnector,
  redditApiConnector,
];

export function getConnector(id: string): Connector | undefined {
  return connectors.find((c) => c.id === id);
}

// Etiquetas legibles por categoría para agrupar en el panel.
export const CATEGORY_LABELS: Record<Connector["category"], string> = {
  data: "Datos",
  auth: "Autenticación",
  outreach: "Canales de contactación",
  listening: "Escucha",
  analysis: "Análisis",
};

export const CATEGORY_ORDER: Connector["category"][] = [
  "data",
  "outreach",
  "listening",
  "analysis",
  "auth",
];
