// Token del servidor MCP remoto, por proyecto. Mismo mecanismo que el de la
// extensión (lib/extension-token.ts): formato <projectId>.<secreto hex>, se
// guarda solo el SHA-256 del secreto en la fila sintética conector_config
// mcp-token:<projectId>, y el plaintext se muestra una única vez.
//
// La diferencia con la extensión es dónde viaja: los conectores personalizados
// de claude.ai no permiten cabeceras propias, así que el token va EN LA URL
// (/api/mcp/<token>/mcp). Mitigaciones: rotación desde el panel, la URL
// completa nunca se loguea (ver tokenTag en lib/logger) y rate limit por token.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { upsertConectorConfig } from "@/lib/db/conector-config";

const key = (projectId: string) => `mcp-token:${projectId}`;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function issueMcpToken(projectId: string): Promise<string> {
  if (!dbConfigured()) throw new Error("Supabase no configurado");
  const secret = randomBytes(24).toString("hex");
  // project_id va NULL a propósito: el proyecto viaja dentro del connector_id.
  await upsertConectorConfig(key(projectId), { hash: sha256(secret) });
  return `${projectId}.${secret}`;
}

// Rotar es emitir de nuevo: el upsert pisa el hash anterior, así que el token
// viejo deja de verificar en la misma operación. Existe como nombre propio
// porque en el panel el botón dice "Regenerar" y el llamador no tiene por qué
// saber que es el mismo camino.
export async function rotateMcpToken(projectId: string): Promise<string> {
  return issueMcpToken(projectId);
}

// Devuelve el projectId si el token es válido, null si no.
export async function verifyMcpToken(token: string | null): Promise<string | null> {
  if (!token || !dbConfigured()) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const projectId = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  if (!/^[0-9a-f-]{36}$/.test(projectId) || secret.length < 32) return null;
  const { data } = await getSupabase()
    .from("conector_config")
    .select("config")
    .eq("connector_id", key(projectId))
    .maybeSingle();
  const stored = (data?.config as { hash?: string } | undefined)?.hash;
  if (!stored) return null;
  const a = Buffer.from(sha256(secret));
  const b = Buffer.from(stored);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return projectId;
}

// URL completa del conector, la que el operador pega en claude.ai. El segmento
// final /mcp es el "transport": en mcp-handler 2.x el handler no mira el path,
// pero la ruta lo exige para que la URL sea la que documenta la spec.
export function mcpUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/$/, "")}/api/mcp/${token}/mcp`;
}
