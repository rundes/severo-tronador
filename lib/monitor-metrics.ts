// Métricas del monitor electoral (spec §8). Definidas una sola vez; el
// informe las consume, no las recalcula. Se nutren de listening_items.meta
// (followers/likeCount/commentCount/viewCount/repostCount/replyCount) que
// carga el plugin. Cuentas agrupadas por categoría, que NO se comparan entre sí.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { getMonitorConfig, type Category } from "@/lib/monitor-config";

// Muestra de comentarios para el prompt del informe: autor anonimizado.
export interface CommentSample {
  autor: string; // c1..cN dentro de la cuenta
  text: string;
  at?: string;
}

export interface AccountMetrics {
  handle: string;
  category: Category;
  followers: number;
  // Amplificación: vistas ÷ seguidores (>5 = circula fuera de su base).
  amplificacion: number | null;
  // Adhesión: me gusta ÷ seguidores.
  adhesion: number | null;
  // Densidad: proporción (0..1) de comentaristas que reaparecen en otra pieza.
  densidad: number | null;
  // Comentarios colectados sobre piezas de esta cuenta, y comentaristas únicos.
  comentarios: number;
  comentaristas: number;
  muestraComentarios: CommentSample[];
  piezas: number;
  ultimaActividad: string | null; // máx entre feed/historias (spec §7.2)
  // Historias (stories) vigentes en este momento, según meta.expiringAt.
  historiasVivas: number;
  // Post/reel más reciente entre las piezas (excluye historias y comentarios).
  ultimaPieza: { url?: string; text: string; likeCount?: number; at: string } | null;
}

interface Row {
  author: string | null;
  source: string | null;
  kind: string | null;
  published_at: string | null;
  created_at: string | null;
  text: string | null;
  meta: Record<string, unknown> | null;
  url: string | null;
  parent_url: string | null;
}

// Muestra por cuenta que viaja al prompt (spec §11: ≤15, anonimizada).
const MAX_SAMPLE = 15;
const MAX_SAMPLE_TEXT = 160;

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

const when = (r: Row): string => r.published_at ?? r.created_at ?? "";

// Métricas por cuenta del escenario, en la ventana dada.
export async function accountMetrics(
  projectId: string,
  days = 7,
  nowMs = Date.now(),
): Promise<AccountMetrics[]> {
  if (!dbConfigured()) return [];
  const cfg = await getMonitorConfig(projectId);
  if (cfg.accounts.length === 0) return [];
  const since = new Date(nowMs - days * 86400_000).toISOString();
  const { data } = await getSupabase()
    .from("listening_items")
    .select("author, source, kind, published_at, created_at, text, meta, url, parent_url")
    .eq("project_id", projectId)
    .gte("created_at", since)
    .limit(5000);
  const rows = (data ?? []) as Row[];

  return cfg.accounts.map((acc) => {
    const h = acc.handle.replace(/^@/, "").toLowerCase();
    const own = rows.filter(
      (r) => (r.author ?? "").replace(/^@/, "").toLowerCase() === h ||
             (r.source ?? "").toLowerCase().includes(h),
    );
    const propias = own.filter((r) => r.kind !== "comment");
    const posts = propias.filter((r) => r.kind !== "story");
    // Un comentario NO tiene el handle de la cuenta como autor (tiene el del
    // comentarista): se asocia por parent_url a una pieza propia.
    const ownUrls = new Set(propias.map((r) => r.url).filter((u): u is string => Boolean(u)));
    const comments = rows.filter(
      (r) => r.kind === "comment" && r.parent_url && ownUrls.has(r.parent_url),
    );
    const historiasVivas = propias.filter(
      (r) => r.kind === "story" && typeof r.meta?.expiringAt === "string" && +new Date(r.meta.expiringAt as string) > nowMs,
    ).length;

    let followers = 0;
    let views = 0;
    let likes = 0;
    // Seguidores/vistas/likes sobre todo lo propio (historias incluidas);
    // `posts` excluye historias y sólo alimenta piezas/ultimaPieza.
    for (const r of propias) {
      followers = Math.max(followers, num(r.meta?.followers) ?? 0);
      views += num(r.meta?.viewCount) ?? 0;
      likes += num(r.meta?.likeCount) ?? 0;
    }

    // Densidad: comentaristas que aparecen en ≥2 piezas distintas de la cuenta.
    const byCommenter = new Map<string, Set<string>>();
    const alias = new Map<string, string>();
    for (const c of comments) {
      const who = (c.author ?? "").replace(/^@/, "").toLowerCase();
      if (!who) continue;
      const set = byCommenter.get(who) ?? new Set<string>();
      set.add(c.parent_url as string);
      byCommenter.set(who, set);
      if (!alias.has(who)) alias.set(who, `c${alias.size + 1}`);
    }
    const recurrentes = [...byCommenter.values()].filter((s) => s.size >= 2).length;
    const densidad = byCommenter.size > 0 ? recurrentes / byCommenter.size : null;
    // Los MAX_SAMPLE más recientes, presentados en el orden en que llegaron.
    const recientes = new Set(
      [...comments].sort((a, b) => when(b).localeCompare(when(a))).slice(0, MAX_SAMPLE),
    );
    const muestraComentarios: CommentSample[] = comments
      .filter((c) => recientes.has(c))
      .map((c) => ({
        autor: alias.get((c.author ?? "").replace(/^@/, "").toLowerCase()) ?? "c?",
        text: (c.text ?? "").slice(0, MAX_SAMPLE_TEXT),
        at: c.published_at ?? c.created_at ?? undefined,
      }));

    const ultima = own.map(when).filter(Boolean).sort().at(-1) ?? null;
    const ultimaPiezaRow = [...posts].sort((a, b) => when(a).localeCompare(when(b))).at(-1) ?? null;
    const ultimaPieza = ultimaPiezaRow
      ? {
          url: ultimaPiezaRow.url ?? undefined,
          text: ultimaPiezaRow.text ?? "",
          likeCount: num(ultimaPiezaRow.meta?.likeCount),
          at: when(ultimaPiezaRow),
        }
      : null;

    return {
      handle: acc.handle,
      category: acc.category,
      followers,
      amplificacion: followers > 0 ? Number((views / followers).toFixed(2)) : null,
      adhesion: followers > 0 ? Number((likes / followers).toFixed(3)) : null,
      densidad: densidad !== null ? Number(densidad.toFixed(2)) : null,
      comentarios: comments.length,
      comentaristas: byCommenter.size,
      muestraComentarios,
      piezas: posts.length,
      ultimaActividad: ultima,
      historiasVivas,
      ultimaPieza,
    };
  });
}
