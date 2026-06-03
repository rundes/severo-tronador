// Escucha activa por handle: cola de timelines de X.
//
// Al importar contactos, cada x_handle se encola en `x_handle_queue`.
// El cron /api/cron/x-timeline drena la cola: por cada handle trae los
// últimos POSTS_PER_USER posteos (timeline del usuario) y los upserta en
// listening_items, alimentando /escucha. Respeta el free tier de X
// (1.500 tweets/mes, compartido con la búsqueda) — los handles que no
// entran por cuota quedan 'pending' para la próxima corrida/mes.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { getConnectorConfig } from "@/lib/connectors/config";
import { getUsage, incrementUsage } from "@/lib/quota";
import { upsertItems } from "@/lib/listening-cache";
import { normalizeHandle } from "@/lib/padron-handles";
import {
  resolveXUserId,
  fetchXUserTimeline,
  POSTS_PER_USER,
  X_FREE_LIMIT,
} from "@/lib/connectors/x-api";
import { log } from "@/lib/logger";

const X_ID = "x-api";
const DEFAULT_BATCH = 50;

// Encola handles (raw o normalizados) para fetch de timeline. Los nuevos
// entran 'pending'; los ya existentes (done/error) se re-encolan para
// refrescar, preservando el author_id cacheado. Best-effort: nunca tira.
export async function enqueueXHandles(
  raw: (string | null | undefined)[],
): Promise<number> {
  if (!dbConfigured()) return 0;
  const handles = Array.from(
    new Set(raw.map((h) => normalizeHandle(h)).filter(Boolean)),
  );
  if (handles.length === 0) return 0;
  const sb = getSupabase();

  // Inserta solo los nuevos (default status='pending'); no pisa author_id.
  const { error: insErr } = await sb
    .from("x_handle_queue")
    .upsert(
      handles.map((h) => ({ handle: h })),
      { onConflict: "handle", ignoreDuplicates: true },
    );
  if (insErr) {
    log.warn("x_timeline.enqueue.insert_failed", { error: insErr.message });
  }

  // Re-encola los existentes que ya estaban procesados/errados.
  const nowIso = new Date().toISOString();
  const { error: updErr } = await sb
    .from("x_handle_queue")
    .update({ status: "pending", enqueued_at: nowIso, updated_at: nowIso })
    .in("handle", handles)
    .neq("status", "pending");
  if (updErr) {
    log.warn("x_timeline.enqueue.update_failed", { error: updErr.message });
  }

  log.info("x_timeline.enqueue", { handles: handles.length });
  return handles.length;
}

export interface XTimelineSummary {
  skipped?: string;
  processed: number; // handles con timeline traído OK
  errors: number; // handles que fallaron (lookup/timeline)
  posts: number; // posteos upserteados en total
  pending: number; // handles que siguen pendientes tras esta corrida
  dropped: number; // pendientes que no entraron por cuota/batch
}

const EMPTY: XTimelineSummary = {
  processed: 0,
  errors: 0,
  posts: 0,
  pending: 0,
  dropped: 0,
};

// Drena la cola hasta el menor de: batch configurado, capacidad de cuota,
// pendientes. Lo que sobra queda 'pending' y se loguea como dropped.
export async function processXHandleQueue(): Promise<XTimelineSummary> {
  if (!dbConfigured()) return { ...EMPTY, skipped: "no db" };
  const cfg = await getConnectorConfig(X_ID);
  const bearer = cfg.X_API_BEARER_TOKEN;
  if (!bearer) return { ...EMPTY, skipped: "no token" };

  const sb = getSupabase();
  const { count: pendingCount } = await sb
    .from("x_handle_queue")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");
  const totalPending = pendingCount ?? 0;
  if (totalPending === 0) return { ...EMPTY };

  // Capacidad por cuota: cada handle consume hasta POSTS_PER_USER tweets.
  const used = await getUsage(X_ID);
  const quotaRemaining = Math.max(0, X_FREE_LIMIT - used);
  const maxByQuota = Math.floor(quotaRemaining / POSTS_PER_USER);
  const batch = Number(cfg.X_TIMELINE_BATCH) || DEFAULT_BATCH;
  const limit = Math.min(batch, maxByQuota, totalPending);

  if (limit <= 0) {
    log.warn("x_timeline.quota_exhausted", {
      totalPending,
      quotaRemaining,
      used,
    });
    return { ...EMPTY, pending: totalPending, dropped: totalPending };
  }

  const { data, error } = await sb
    .from("x_handle_queue")
    .select("handle, author_id, username")
    .eq("status", "pending")
    .order("enqueued_at", { ascending: true })
    .limit(limit);
  if (error) {
    log.warn("x_timeline.select_failed", { error: error.message });
    return { ...EMPTY, pending: totalPending, dropped: totalPending };
  }

  const rows = (data ?? []) as {
    handle: string;
    author_id: string | null;
    username: string | null;
  }[];
  let processed = 0;
  let errors = 0;
  let posts = 0;

  for (const row of rows) {
    const nowIso = new Date().toISOString();
    try {
      let authorId = row.author_id ?? undefined;
      let username = row.username ?? undefined;
      if (!authorId || !username) {
        const ref = await resolveXUserId(row.handle, bearer);
        authorId = ref.id;
        username = ref.username;
      }
      const items = await fetchXUserTimeline(authorId, username, bearer);
      await upsertItems(X_ID, items);
      if (items.length > 0) await incrementUsage(X_ID, items.length);
      posts += items.length;
      processed += 1;
      await sb
        .from("x_handle_queue")
        .update({
          status: "done",
          author_id: authorId,
          username,
          posts_fetched: items.length,
          last_fetched_at: nowIso,
          last_error: null,
          updated_at: nowIso,
        })
        .eq("handle", row.handle);
    } catch (e) {
      errors += 1;
      const msg = (e as Error).message;
      log.warn("x_timeline.handle_failed", { handle: row.handle, error: msg });
      await sb
        .from("x_handle_queue")
        .update({
          status: "error",
          last_error: msg.slice(0, 300),
          updated_at: nowIso,
        })
        .eq("handle", row.handle);
    }
  }

  const pending = totalPending - processed - errors;
  const dropped = Math.max(0, totalPending - rows.length);
  log.info("x_timeline.run", { processed, errors, posts, pending, dropped });
  return { processed, errors, posts, pending, dropped };
}
