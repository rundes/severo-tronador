const BASE = "https://rundes.github.io/severo-tronador/INTEGRATIONS.html";
const ANCHOR: Record<string, string> = {
  "google-oauth": "#1-google-oauth-auth",
  "google-sheets-padron": "#2-google-sheets-datos",
  "google-sheets-archive": "#2-google-sheets-datos",
  resend: "#3-resend-email",
  "meta-wa-cloud": "#4-meta-cloud-api-whatsapp",
  "telnyx-sms": "#5-telnyx-sms",
  "telnyx-voice": "#6-telnyx-voz--ivr",
  "claude-api": "#7-claude-api-análisis",
  gdelt: "#8-gdelt-listening",
  "x-api": "#9-x-api-listening",
  "reddit-api": "#10-reddit-api-listening",
};
export function setupLink(connectorId: string): string {
  return BASE + (ANCHOR[connectorId] ?? "");
}
