// Tracking de email por destinatario: aperturas (pixel) + clicks (redirect).
// El token es el survey token del envío (único por destinatario) → resuelve
// proyecto/campaña/dni vía survey.resolveToken. Persiste en email_events;
// fallback en memoria sin Supabase.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { DEFAULT_PROJECT_ID } from "@/lib/projects";
import { resolveToken } from "@/lib/survey";
import { log } from "@/lib/logger";

export type EventKind = "open" | "click";

export interface EmailEvent {
  id?: string;
  project_id: string;
  token: string;
  campaign_id: string | null;
  dni: string | null;
  kind: EventKind;
  url: string | null;
  user_agent: string | null;
  at: string;
}

interface Mem {
  __emailEvents?: EmailEvent[];
}
const g = globalThis as unknown as Mem;
const mem = (g.__emailEvents ??= []);

// Registra un evento. Best-effort: nunca tira (el pixel/redirect deben
// responder igual). Resuelve proyecto/campaña del token.
export async function recordEvent(
  kind: EventKind,
  token: string,
  opts: { url?: string; userAgent?: string } = {},
): Promise<void> {
  try {
    const ref = await resolveToken(token);
    const event: EmailEvent = {
      project_id: ref?.projectId ?? DEFAULT_PROJECT_ID,
      token,
      campaign_id: ref?.campaignId ?? null,
      dni: ref?.dni ?? null,
      kind,
      url: opts.url ?? null,
      user_agent: opts.userAgent?.slice(0, 400) ?? null,
      at: new Date().toISOString(),
    };
    if (!dbConfigured()) {
      mem.push({ id: crypto.randomUUID(), ...event });
      return;
    }
    const { error } = await getSupabase().from("email_events").insert(event);
    if (error) log.warn("tracking.insert_failed", { error: error.message, kind });
  } catch (e) {
    log.warn("tracking.exception", { msg: (e as Error).message });
  }
}

export interface CampaignTracking {
  opens: number; // aperturas totales
  openedRecipients: number; // destinatarios únicos que abrieron
  clicks: number; // clicks totales
}

// Conteo de tracking de una campaña (para el detalle de campaña).
export async function campaignTracking(
  projectId: string,
  campaignId: string,
): Promise<CampaignTracking> {
  let rows: Pick<EmailEvent, "kind" | "dni">[];
  if (!dbConfigured()) {
    rows = mem.filter(
      (e) => e.project_id === projectId && e.campaign_id === campaignId,
    );
  } else {
    const { data, error } = await getSupabase()
      .from("email_events")
      .select("kind, dni")
      .eq("project_id", projectId)
      .eq("campaign_id", campaignId);
    if (error) return { opens: 0, openedRecipients: 0, clicks: 0 };
    rows = (data ?? []) as Pick<EmailEvent, "kind" | "dni">[];
  }
  const opens = rows.filter((r) => r.kind === "open");
  const clicks = rows.filter((r) => r.kind === "click");
  const openedRecipients = new Set(
    opens.map((o) => o.dni).filter(Boolean),
  ).size;
  return { opens: opens.length, openedRecipients, clicks: clicks.length };
}

// ── Helpers para inyectar tracking en el cuerpo del email ──────────────────

// Pixel transparente 1x1 al final del body (registra apertura).
export function openPixel(baseUrl: string, token: string): string {
  return `<img src="${baseUrl}/api/track/o/${token}" width="1" height="1" alt="" style="display:none;border:0" />`;
}

// Envuelve una URL en un redirect de click rastreado.
export function trackedLink(
  baseUrl: string,
  token: string,
  target: string,
): string {
  const u = Buffer.from(target, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${baseUrl}/api/track/c/${token}?u=${u}`;
}

// Decodifica el `u` del redirect de click.
export function decodeTarget(u: string): string | null {
  try {
    const padded = u.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const url = Buffer.from(padded + pad, "base64").toString("utf8");
    if (!/^https?:\/\//i.test(url)) return null; // solo http(s)
    return url;
  } catch {
    return null;
  }
}
