// Vínculo entre un proyecto y la conversación de claude.ai desde la que el
// operador trabaja. Se completa de dos formas: el operador pega la URL en la
// tarjeta del panel, o Claude llama link_conversation() desde la propia
// conversación. lastToolAt/client se refrescan en cada llamada MCP, así el
// panel puede decir "última llamada: hace 5 min · Claude in Chrome".
//
// Persistencia sin DDL: fila sintética conector_config claude-link:<projectId>.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { upsertConectorConfig } from "@/lib/db/conector-config";
import { log } from "@/lib/logger";

export interface ClaudeLink {
  conversationUrl?: string;
  linkedAt?: string; // ISO
  lastToolAt?: string; // ISO
  lastReportAt?: string; // ISO
  client?: string; // "Claude in Chrome 1.2", "claude-code 2.0", …
}

const key = (projectId: string) => `claude-link:${projectId}`;

// Una URL de conversación es una credencial débil que el operador pega a mano:
// se acepta únicamente https://claude.ai (o www). Cualquier otro host abriría
// un link de salida arbitrario desde el panel.
const MAX_URL = 500;

export function isClaudeConversationUrl(url: string): boolean {
  const t = (url ?? "").trim();
  if (!t || t.length > MAX_URL) return false;
  try {
    const u = new URL(t);
    return u.protocol === "https:" && (u.hostname === "claude.ai" || u.hostname === "www.claude.ai");
  } catch {
    return false;
  }
}

// La fila es JSON libre (la escribió otra versión del servidor o alguien a
// mano): lo que no sea string con contenido se descarta en vez de romper el
// panel.
const str = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, MAX_URL) : undefined;
};

export function normalizeLink(raw: unknown): ClaudeLink {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: ClaudeLink = {};
  const url = str(r.conversationUrl);
  if (url) out.conversationUrl = url;
  const linkedAt = str(r.linkedAt);
  if (linkedAt) out.linkedAt = linkedAt;
  const lastToolAt = str(r.lastToolAt);
  if (lastToolAt) out.lastToolAt = lastToolAt;
  const lastReportAt = str(r.lastReportAt);
  if (lastReportAt) out.lastReportAt = lastReportAt;
  const client = str(r.client);
  if (client) out.client = client.slice(0, 80);
  return out;
}

export async function readClaudeLink(projectId: string): Promise<ClaudeLink> {
  if (!dbConfigured()) return {};
  const { data } = await getSupabase()
    .from("conector_config")
    .select("config")
    .eq("connector_id", key(projectId))
    .maybeSingle();
  return normalizeLink(data?.config);
}

export async function saveClaudeLink(projectId: string, link: ClaudeLink): Promise<void> {
  await upsertConectorConfig(key(projectId), link);
}

// Marca actividad del canal MCP. Nunca lanza: es telemetría del vínculo, no
// el trabajo — si falla, la tool igual respondió.
export async function touchClaudeLink(
  projectId: string,
  client?: string,
  opts: { at?: string; report?: boolean } = {},
): Promise<void> {
  const at = opts.at ?? new Date().toISOString();
  try {
    const current = await readClaudeLink(projectId);
    const next: ClaudeLink = { ...current, lastToolAt: at };
    if (client) next.client = client.slice(0, 80);
    if (opts.report) next.lastReportAt = at;
    await saveClaudeLink(projectId, next);
  } catch (error) {
    log.warn("claude_link.touch_failed", { projectId, error: (error as Error).message });
  }
}
