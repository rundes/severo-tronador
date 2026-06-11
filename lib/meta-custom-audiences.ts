// Custom Audiences de Meta (Fase 2): empuja un segmento de la app como
// audiencia real para que un anuncio pueda targetearla. Server-only.
//
// Privacidad: los emails/teléfonos se NORMALIZAN y se HASHEAN con SHA-256
// ANTES de salir de la app (regla de Meta). Nunca se envía PII en claro.
// Mock-first: sin token/cuenta publicitaria devuelve ids/contadores mock.
//
// Requisito de negocio: la cuenta de Meta Business debe haber aceptado los
// Términos de Custom Audiences; si no, la API rechaza la subida (se surfacea
// el error de Meta tal cual).
import { createHash } from "crypto";
import { getMetaConfig } from "@/lib/meta";
import { getSavedSegment } from "@/lib/segments-store";
import { loadContacts, applySegment } from "@/lib/segments";

const GRAPH = "https://graph.facebook.com/v21.0";

function withAct(id: string): string {
  return id.startsWith("act_") ? id : `act_${id}`;
}
function idStamp(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
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

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

// Normalización de Meta antes del hash.
// Email: trim + minúsculas. Teléfono: solo dígitos; si no trae código de país
// (AR), se antepone 54. Devuelve hash hex, o "" si no hay dato.
function hashEmail(email?: string | null): string {
  const e = (email ?? "").trim().toLowerCase();
  return e ? sha256(e) : "";
}
function hashPhone(phone?: string | null): string {
  let d = (phone ?? "").replace(/\D/g, "");
  if (!d) return "";
  d = d.replace(/^0+/, "");
  if (!d.startsWith("54") && d.length <= 11) d = "54" + d; // AR por defecto
  return sha256(d);
}

export interface AudienceResult {
  ok: boolean;
  mode: "mock" | "live";
  audienceId?: string;
  matched: number; // filas con al menos un identificador hasheado
  total: number; // contactos del segmento
  error?: string;
}

// Resuelve el segmento guardado → contactos → filas hasheadas [email, phone].
async function hashedRowsForSegment(
  projectId: string,
  segmentId: string,
): Promise<{ rows: [string, string][]; total: number }> {
  const seg = await getSavedSegment(projectId, segmentId);
  if (!seg) return { rows: [], total: 0 };
  const all = await loadContacts(projectId);
  const matched = applySegment(all, seg.filtros);
  const rows: [string, string][] = [];
  for (const { contact } of matched) {
    const eh = hashEmail(contact.email);
    const ph = hashPhone(contact.telefono);
    if (eh || ph) rows.push([eh, ph]);
  }
  return { rows, total: matched.length };
}

// Crea la Custom Audience y le sube los usuarios hasheados del segmento.
export async function createAndPopulateAudience(input: {
  projectId: string;
  segmentId: string;
  name: string;
}): Promise<AudienceResult> {
  const { rows, total } = await hashedRowsForSegment(input.projectId, input.segmentId);
  const { token, adAccountId } = await getMetaConfig();
  if (!token || !adAccountId) {
    return { ok: true, mode: "mock", audienceId: `mock-aud-${idStamp(input.segmentId)}`, matched: rows.length, total };
  }
  try {
    const created = await graphPost(`${withAct(adAccountId)}/customaudiences`, {
      name: input.name,
      subtype: "CUSTOM",
      description: `Segmento Tronador ${input.segmentId}`,
      customer_file_source: "USER_PROVIDED_ONLY",
      access_token: token,
    });
    const audienceId = String(created.id ?? "");
    if (rows.length) {
      await graphPost(`${audienceId}/users`, {
        payload: JSON.stringify({ schema: ["EMAIL", "PHONE"], data: rows }),
        access_token: token,
      });
    }
    return { ok: true, mode: "live", audienceId, matched: rows.length, total };
  } catch (e) {
    return { ok: false, mode: "live", matched: rows.length, total, error: (e as Error).message };
  }
}

export interface AudienceStatus {
  ok: boolean;
  mode: "mock" | "live";
  approximateCount?: number;
  status?: string;
  error?: string;
}

// Estado de la audiencia (tamaño aproximado + estado de procesamiento).
export async function getAudienceStatus(audienceId: string): Promise<AudienceStatus> {
  const { token } = await getMetaConfig();
  if (!token || !audienceId || audienceId.startsWith("mock-")) {
    return { ok: true, mode: "mock", approximateCount: 0, status: "mock" };
  }
  try {
    const res = await fetch(
      `${GRAPH}/${audienceId}?fields=approximate_count_lower_bound,operation_status&access_token=${encodeURIComponent(token)}`,
    );
    const data = (await res.json()) as {
      approximate_count_lower_bound?: number;
      operation_status?: { description?: string };
      error?: { message?: string };
    };
    if (!res.ok || data.error) throw new Error(data.error?.message ?? `HTTP ${res.status}`);
    return {
      ok: true,
      mode: "live",
      approximateCount: data.approximate_count_lower_bound ?? 0,
      status: data.operation_status?.description ?? "—",
    };
  } catch (e) {
    return { ok: false, mode: "live", error: (e as Error).message };
  }
}
