// Métricas del monitor electoral (spec §8). Definidas una sola vez; el
// informe las consume, no las recalcula. Se nutren de listening_items.meta
// (followers/likeCount/commentCount/viewCount/repostCount) que carga el
// plugin. Cuentas agrupadas por categoría, que NO se comparan entre sí.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { getMonitorConfig, type Category } from "@/lib/monitor-config";

export interface AccountMetrics {
  handle: string;
  category: Category;
  followers: number;
  // Amplificación: vistas ÷ seguidores (>5 = circula fuera de su base).
  amplificacion: number | null;
  // Adhesión: me gusta ÷ seguidores.
  adhesion: number | null;
  // Densidad: % de comentaristas que reaparecen en otra pieza de la cuenta.
  densidad: number | null;
  piezas: number;
  ultimaActividad: string | null; // máx entre feed/historias (spec §7.2)
}

interface Row {
  author: string | null;
  source: string | null;
  kind: string | null;
  published_at: string | null;
  created_at: string | null;
  text: string | null;
  meta: Record<string, unknown> | null;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

// Métricas por cuenta del escenario, en la ventana dada.
export async function accountMetrics(
  projectId: string,
  days = 7,
): Promise<AccountMetrics[]> {
  if (!dbConfigured()) return [];
  const cfg = await getMonitorConfig(projectId);
  if (cfg.accounts.length === 0) return [];
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data } = await getSupabase()
    .from("listening_items")
    .select("author, source, kind, published_at, created_at, text, meta")
    .eq("project_id", projectId)
    .gte("created_at", since)
    .limit(5000);
  const rows = (data ?? []) as Row[];

  // Índice de comentaristas por autor de cuenta (para densidad).
  return cfg.accounts.map((acc) => {
    const h = acc.handle.replace(/^@/, "").toLowerCase();
    const own = rows.filter(
      (r) => (r.author ?? "").replace(/^@/, "").toLowerCase() === h ||
             (r.source ?? "").toLowerCase().includes(h),
    );
    const posts = own.filter((r) => r.kind !== "comment");
    const comments = own.filter((r) => r.kind === "comment");
    let followers = 0;
    let views = 0;
    let likes = 0;
    for (const r of posts) {
      followers = Math.max(followers, num(r.meta?.followers) ?? 0);
      views += num(r.meta?.viewCount) ?? 0;
      likes += num(r.meta?.likeCount) ?? 0;
    }
    // Densidad: comentaristas que aparecen en ≥2 piezas de la cuenta.
    const byCommenter = new Map<string, Set<string>>();
    for (const c of comments) {
      const who = (c.author ?? "").toLowerCase();
      if (!who) continue;
      const set = byCommenter.get(who) ?? new Set();
      set.add(c.published_at ?? c.created_at ?? c.text ?? "");
      byCommenter.set(who, set);
    }
    const recurrentes = [...byCommenter.values()].filter((s) => s.size >= 2).length;
    const densidad = byCommenter.size > 0 ? recurrentes / byCommenter.size : null;
    const ultima = own
      .map((r) => r.published_at ?? r.created_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

    return {
      handle: acc.handle,
      category: acc.category,
      followers,
      amplificacion: followers > 0 ? Number((views / followers).toFixed(2)) : null,
      adhesion: followers > 0 ? Number((likes / followers).toFixed(3)) : null,
      densidad: densidad !== null ? Number(densidad.toFixed(2)) : null,
      piezas: posts.length,
      ultimaActividad: ultima,
    };
  });
}
