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
