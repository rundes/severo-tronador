// Cache materializada de items de listening (Plan 05 F5).
//
// Patrón: cron horario (/api/cron/listening-pull) fetcha cada source y
// hace upsert por url. runListening() prefiere leer de DB cuando la
// cache tiene filas frescas; cae a live fetch si la tabla está vacía o
// Supabase no está configurado.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import type { ListenItem, ListeningConnector } from "@/lib/connectors/types";
import { connectors } from "@/lib/connectors/registry";
import { getListeningConfig } from "@/lib/listening-config";
import { log } from "@/lib/logger";

interface ListeningRow {
  id?: string;
  connector_id: string | null;
  source: string | null;
  text: string | null;
  url: string | null;
  published_at: string | null;
  topic: string | null;
  author: string | null;
  kind: string | null;
  parent_url: string | null;
  lat: number | null;
  lng: number | null;
  updated_at?: string;
}

function toListenItem(r: ListeningRow): ListenItem {
  return {
    source: r.source ?? "unknown",
    text: r.text ?? "",
    url: r.url ?? undefined,
    publishedAt: r.published_at ?? undefined,
    author: r.author ?? undefined,
    kind: (r.kind ?? undefined) as ListenItem["kind"],
    parentUrl: r.parent_url ?? undefined,
  };
}

function toRow(connectorId: string, item: ListenItem): ListeningRow {
  return {
    connector_id: connectorId,
    source: item.source,
    text: item.text,
    url: item.url ?? null,
    published_at: item.publishedAt ?? null,
    topic: null,
    author: item.author ?? null,
    kind: item.kind ?? null,
    parent_url: item.parentUrl ?? null,
    lat: null,
    lng: null,
    updated_at: new Date().toISOString(),
  };
}

// Items en los últimos `windowDays` días, opcionalmente filtrados por
// connector_id (se usa para respetar el filter de fuentes habilitadas).
export async function readCachedItems(
  windowDays = 14,
  connectorIds?: string[],
): Promise<ListenItem[]> {
  if (!dbConfigured()) return [];
  const since = new Date(
    Date.now() - windowDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  let q = getSupabase()
    .from("listening_items")
    .select(
      "source, text, url, published_at, topic, author, kind, parent_url, lat, lng, connector_id",
    )
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(2000);
  if (connectorIds && connectorIds.length > 0) {
    q = q.in("connector_id", connectorIds);
  }
  const { data, error } = await q;
  if (error) {
    log.warn("listening.cache.read_failed", { error: error.message });
    return [];
  }
  return (data ?? []).map((r) => toListenItem(r as ListeningRow));
}

// True si hay rows en la ventana — para decidir cache vs live fetch.
export async function cacheHasFreshItems(windowDays = 7): Promise<boolean> {
  if (!dbConfigured()) return false;
  const since = new Date(
    Date.now() - windowDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { count, error } = await getSupabase()
    .from("listening_items")
    .select("*", { count: "exact", head: true })
    .gte("published_at", since);
  if (error) return false;
  return (count ?? 0) > 0;
}

// Upsert por url. Items sin url se insertan siempre.
export async function upsertItems(
  connectorId: string,
  items: ListenItem[],
): Promise<{ inserted: number; skipped: number }> {
  if (!dbConfigured() || items.length === 0) {
    return { inserted: 0, skipped: items.length };
  }
  const sb = getSupabase();
  const withUrl = items.filter((i) => !!i.url);
  const withoutUrl = items.filter((i) => !i.url);

  let inserted = 0;
  let skipped = 0;

  if (withUrl.length > 0) {
    const { error, count } = await sb
      .from("listening_items")
      .upsert(
        withUrl.map((i) => toRow(connectorId, i)),
        {
          onConflict: "url",
          ignoreDuplicates: false,
          count: "exact",
        },
      );
    if (error) {
      log.warn("listening.cache.upsert_failed", { error: error.message });
      skipped += withUrl.length;
    } else {
      inserted += count ?? withUrl.length;
    }
  }

  if (withoutUrl.length > 0) {
    const { error, count } = await sb
      .from("listening_items")
      .insert(
        withoutUrl.map((i) => toRow(connectorId, i)),
        { count: "exact" },
      );
    if (error) {
      log.warn("listening.cache.insert_failed", { error: error.message });
      skipped += withoutUrl.length;
    } else {
      inserted += count ?? withoutUrl.length;
    }
  }

  return { inserted, skipped };
}

// Pull desde todos los listening connectors con la config actual.
// Usado por el cron y por backfill manual.
export interface PullSummary {
  bySource: Record<string, { fetched: number; upserted: number }>;
  total: number;
}

export async function pullAllSources(): Promise<PullSummary> {
  const cfg = await getListeningConfig();
  const listeners = connectors.filter(
    (c) => c.category === "listening",
  ) as ListeningConnector[];

  const summary: PullSummary = { bySource: {}, total: 0 };

  for (const l of listeners) {
    if (cfg.fuentes.length > 0 && !cfg.fuentes.includes(l.id)) continue;
    try {
      const items = await l.fetch({
        keywords: cfg.keywords,
        zona: cfg.zona || undefined,
        pais: cfg.pais || undefined,
        radioKm: cfg.radioKm,
        lat: cfg.lat,
        lng: cfg.lng,
      });
      const { inserted } = await upsertItems(l.id, items);
      summary.bySource[l.id] = {
        fetched: items.length,
        upserted: inserted,
      };
      summary.total += items.length;
    } catch (e) {
      log.warn("listening.cache.pull_failed", {
        source: l.id,
        error: (e as Error).message,
      });
      summary.bySource[l.id] = { fetched: 0, upserted: 0 };
    }
  }

  return summary;
}
