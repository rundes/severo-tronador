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

// Alcance que resuelve un token: el conector clásico apunta a UN proyecto; el
// de cuenta apunta al operador (email) y resuelve el proyecto en cada llamada
// por membresía. defaultProjectId es solo el default de LECTURA del conector
// de cuenta: las tools de escritura exigen `project` explícito siempre.
export type McpScope =
  | { kind: "project"; projectId: string }
  | { kind: "account"; email: string; defaultProjectId: string | null };

// El prefijo del token de cuenta deriva del email (hash truncado, no
// reversible): regenerar PISA la misma fila, así rotar invalida el token
// anterior con la misma semántica que el de proyecto. 24 hex no colisionan
// con el formato uuid de projectId (36 chars con guiones).
const acctPrefix = (email: string) => `acct-${sha256(email.trim().toLowerCase()).slice(0, 24)}`;

export async function issueMcpToken(projectId: string): Promise<string> {
  if (!dbConfigured()) throw new Error("Supabase no configurado");
  const secret = randomBytes(24).toString("hex");
  // project_id va NULL a propósito: el proyecto viaja dentro del connector_id.
  await upsertConectorConfig(key(projectId), { hash: sha256(secret) });
  return `${projectId}.${secret}`;
}

// Token multiproyecto atado al email del operador. El email queda en la fila
// (server-side), nunca en la URL. defaultProjectId: proyecto activo al
// generarlo, usado solo como default de lectura.
export async function issueAccountMcpToken(
  email: string,
  defaultProjectId: string | null,
): Promise<string> {
  if (!dbConfigured()) throw new Error("Supabase no configurado");
  const secret = randomBytes(24).toString("hex");
  const prefix = acctPrefix(email);
  await upsertConectorConfig(key(prefix), {
    hash: sha256(secret),
    email: email.trim().toLowerCase(),
    defaultProjectId,
  });
  return `${prefix}.${secret}`;
}

// Rotar es emitir de nuevo: el upsert pisa el hash anterior, así que el token
// viejo deja de verificar en la misma operación. Existe como nombre propio
// porque en el panel el botón dice "Regenerar" y el llamador no tiene por qué
// saber que es el mismo camino.
export async function rotateMcpToken(projectId: string): Promise<string> {
  return issueMcpToken(projectId);
}

// Devuelve el alcance del token (proyecto o cuenta), null si no valida. El
// formato del prefijo decide qué fila se busca; la comparación del secreto es
// en tiempo constante en ambos casos.
export async function verifyMcpScope(token: string | null): Promise<McpScope | null> {
  if (!token || !dbConfigured()) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const prefix = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  const esProyecto = /^[0-9a-f-]{36}$/.test(prefix);
  const esCuenta = /^acct-[0-9a-f]{24}$/.test(prefix);
  if ((!esProyecto && !esCuenta) || secret.length < 32) return null;
  const { data } = await getSupabase()
    .from("conector_config")
    .select("config")
    .eq("connector_id", key(prefix))
    .maybeSingle();
  const cfg = (data?.config ?? null) as
    | { hash?: string; email?: string; defaultProjectId?: string | null }
    | null;
  if (!cfg?.hash) return null;
  const a = Buffer.from(sha256(secret));
  const b = Buffer.from(cfg.hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (esProyecto) return { kind: "project", projectId: prefix };
  // Fila de cuenta sin email es una fila rota (la escribió otra versión):
  // rechazar en vez de adivinar.
  if (!cfg.email) return null;
  return { kind: "account", email: cfg.email, defaultProjectId: cfg.defaultProjectId ?? null };
}

// Devuelve el projectId si el token es válido y de alcance proyecto, null si
// no. Se conserva por compatibilidad con los llamadores previos al alcance
// cuenta.
export async function verifyMcpToken(token: string | null): Promise<string | null> {
  const scope = await verifyMcpScope(token);
  return scope?.kind === "project" ? scope.projectId : null;
}

// URL completa del conector, la que el operador pega en claude.ai. El segmento
// final /mcp es el "transport": en mcp-handler 2.x el handler no mira el path,
// pero la ruta lo exige para que la URL sea la que documenta la spec.
export function mcpUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/$/, "")}/api/mcp/${token}/mcp`;
}
