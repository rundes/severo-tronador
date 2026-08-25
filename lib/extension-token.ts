// Token de la extensión de Chrome, por proyecto. Formato:
// <projectId>.<secreto hex> — el proyecto viaja en el token para resolver
// la fila sin iterar. Se guarda solo el SHA-256 del secreto (fila sintética
// conector_config extension-token:<projectId>); el plaintext se muestra una
// única vez al generarlo.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";

const key = (projectId: string) => `extension-token:${projectId}`;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function issueExtensionToken(projectId: string): Promise<string> {
  if (!dbConfigured()) throw new Error("Supabase no configurado");
  const secret = randomBytes(24).toString("hex");
  // La unique de conector_config es (connector_id, project_id) NULLS NOT
  // DISTINCT (migración 0053). Con onConflict "connector_id" solo, Postgres
  // devolvía 42P10 y el botón "Generar token" fallaba para cualquier owner.
  // project_id va NULL a propósito: el proyecto viaja dentro del connector_id.
  const { error } = await getSupabase().from("conector_config").upsert(
    {
      connector_id: key(projectId),
      project_id: null,
      config: { hash: sha256(secret) },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connector_id,project_id" },
  );
  if (error) throw error;
  return `${projectId}.${secret}`;
}

// Devuelve el projectId si el token es válido, null si no.
export async function verifyExtensionToken(
  token: string | null,
): Promise<string | null> {
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
