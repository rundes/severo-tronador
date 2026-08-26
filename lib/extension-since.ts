// Fecha de corte por cuenta para la extensión: la última pieza guardada de
// esa cuenta en esa plataforma, o 7 días atrás si nunca se guardó nada. El
// content script filtra por fecha (taken_at / datetime) y NUNCA por posición:
// los posts fijados van primero y son viejos.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import type { MonitorAccount, Platform } from "@/lib/monitor-config";

const PLATFORM_BY_CONNECTOR: Record<string, Platform> = {
  "meta-ig": "instagram",
  "x-api": "x",
  "fb-pages": "facebook",
  tiktok: "tiktok",
};
// Comentarios e historias ajenas no marcan el corte de las piezas propias.
const PIECE_KINDS = ["post", "reel", "story"];
const DEFAULT_DAYS = 7;

interface Row {
  author: string | null;
  connector_id: string | null;
  kind: string | null;
  published_at: string | null;
}

export const accountKey = (platform: string, handle: string): string =>
  `${platform}:${handle.replace(/^@/, "").toLowerCase()}`;

export function defaultSince(nowMs = Date.now()): string {
  return new Date(nowMs - DEFAULT_DAYS * 86400_000).toISOString();
}

export async function sinceByAccount(
  projectId: string,
  accounts: MonitorAccount[],
  nowMs = Date.now(),
): Promise<Record<string, string>> {
  const fallback = defaultSince(nowMs);
  const out: Record<string, string> = {};
  for (const a of accounts) out[accountKey(a.platform, a.handle)] = fallback;
  if (!dbConfigured() || accounts.length === 0) return out;

  const { data } = await getSupabase()
    .from("listening_items")
    .select("author, connector_id, kind, published_at")
    .eq("project_id", projectId)
    .in("kind", PIECE_KINDS)
    .order("published_at", { ascending: false })
    .limit(2000);

  const resuelto = new Set<string>();
  for (const row of (data ?? []) as Row[]) {
    const platform = PLATFORM_BY_CONNECTOR[row.connector_id ?? ""];
    if (!platform || !row.author || !row.published_at) continue;
    const key = accountKey(platform, row.author);
    if (!(key in out) || resuelto.has(key)) continue;
    // Vienen ordenadas descendente: la primera de cada cuenta es la última.
    out[key] = row.published_at;
    resuelto.add(key);
  }
  return out;
}
