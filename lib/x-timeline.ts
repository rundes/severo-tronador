// Escucha activa por handle: cola de posteos de X.
//
// Al importar contactos, cada x_handle se encola en `x_handle_queue`.
// El cron /api/cron/x-timeline drena la cola: por cada handle trae sus
// últimos posteos vía search/recent `from:handle` (endpoint del free tier;
// timeline/user-lookup exigen plan pago → HTTP 402) y los upserta en
// listening_items, alimentando /escucha. Cubre los últimos ~7 días.
// Respeta el free tier de X (1.500 tweets/mes, compartido con la búsqueda)
// — los handles que no entran por cuota quedan 'pending' para la próxima
// corrida/mes.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { getConnectorConfig } from "@/lib/connectors/config";
import { getUsage, incrementUsage } from "@/lib/quota";
import { upsertItems } from "@/lib/listening-cache";
import { normalizeHandle } from "@/lib/padron-handles";
import {
  fetchXRecentByHandle,
  COST_PER_HANDLE,
  X_FREE_LIMIT,
} from "@/lib/connectors/x-api";
import { log } from "@/lib/logger";

const X_ID = "x-api";
const DEFAULT_BATCH = 50;

// Encola handles (raw o normalizados) para fetch de posteos. Los nuevos
// entran 'pending'; los ya existentes (done/error) se re-encolan para
// refrescar. Best-effort: nunca tira.
export async function enqueueXHandles(
  projectId: string,
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
      handles.map((h) => ({ project_id: projectId, handle: h })),
      { onConflict: "project_id,handle", ignoreDuplicates: true },
    );
  if (insErr) {
    log.warn("x_timeline.enqueue.insert_failed", { error: insErr.message });
  }

  // Re-encola los existentes que ya estaban procesados/errados.
  const nowIso = new Date().toISOString();
  const { error: updErr } = await sb
    .from("x_handle_queue")
    .update({ status: "pending", enqueued_at: nowIso, updated_at: nowIso })
    .eq("project_id", projectId)
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
export async function processXHandleQueue(
  projectId: string,
): Promise<XTimelineSummary> {
  if (!dbConfigured()) return { ...EMPTY, skipped: "no db" };
  const cfg = await getConnectorConfig(X_ID);
  const bearer = cfg.X_API_BEARER_TOKEN;
  if (!bearer) return { ...EMPTY, skipped: "no token" };

  const sb = getSupabase();
  const { count: pendingCount } = await sb
    .from("x_handle_queue")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("status", "pending");
  const totalPending = pendingCount ?? 0;
  if (totalPending === 0) return { ...EMPTY };

  // Capacidad por cuota: cada handle consume hasta COST_PER_HANDLE tweets.
  const used = await getUsage(X_ID, projectId);
  const quotaRemaining = Math.max(0, X_FREE_LIMIT - used);
  const maxByQuota = Math.floor(quotaRemaining / COST_PER_HANDLE);
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
    .select("handle")
    .eq("project_id", projectId)
    .eq("status", "pending")
    .order("enqueued_at", { ascending: true })
    .limit(limit);
  if (error) {
    log.warn("x_timeline.select_failed", { error: error.message });
    return { ...EMPTY, pending: totalPending, dropped: totalPending };
  }

  const rows = (data ?? []) as { handle: string }[];
  let processed = 0;
  let errors = 0;
  let posts = 0;

  for (const row of rows) {
    const nowIso = new Date().toISOString();
    try {
      const { items, raw } = await fetchXRecentByHandle(row.handle, bearer);
      await upsertItems(projectId, X_ID, items);
      // Presupuestamos por lo que devolvió la API (raw), no por lo guardado.
      if (raw > 0) await incrementUsage(X_ID, raw, projectId);
      posts += items.length;
      processed += 1;
      await sb
        .from("x_handle_queue")
        .update({
          status: "done",
          username: items[0]?.author ?? row.handle,
          posts_fetched: items.length,
          last_fetched_at: nowIso,
          last_error: null,
          updated_at: nowIso,
        })
        .eq("project_id", projectId)
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
        .eq("project_id", projectId)
        .eq("handle", row.handle);
    }
  }

  const pending = totalPending - processed - errors;
  const dropped = Math.max(0, totalPending - rows.length);
  log.info("x_timeline.run", { processed, errors, posts, pending, dropped });
  return { processed, errors, posts, pending, dropped };
}
