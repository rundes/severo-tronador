import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import type { RadioProgram } from "@/lib/radio";

export interface ListeningConfig {
  zona: string;
  pais: string;
  radioKm: number | null;
  lat: number | null;
  lng: number | null;
  keywords: string[];
  fuentes: string[];
  rssFeeds: string[];
  xHandles: string[];
  radioStreams: RadioProgram[];
}

const DEFAULT: ListeningConfig = {
  zona: "", pais: "AR", radioKm: null, lat: null, lng: null,
  keywords: [], fuentes: [], rssFeeds: [], xHandles: [], radioStreams: [],
};

interface Row {
  geo: { zona?: string; pais?: string } | null;
  radio: number | null;
  lat: number | null;
  lng: number | null;
  keywords: string[] | null;
  fuentes: string[] | null;
  rss_feeds: string[] | null;
  x_handles: string[] | null;
  radio_streams: RadioProgram[] | null;
}

// Config de escucha POR PROYECTO. La tabla listening_config tiene PK project_id
// (migración 0020); cada proyecto tiene su propia fila (o el DEFAULT si no hay).
export async function getListeningConfig(
  projectId: string,
): Promise<ListeningConfig> {
  if (!dbConfigured()) return { ...DEFAULT };
  const { data } = await getSupabase()
    .from("listening_config")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!data) return { ...DEFAULT };
  const r = data as Row;
  return {
    zona: r.geo?.zona ?? "",
    pais: r.geo?.pais ?? "AR",
    radioKm: r.radio ?? null,
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    keywords: r.keywords ?? [],
    fuentes: r.fuentes ?? [],
    rssFeeds: r.rss_feeds ?? [],
    xHandles: r.x_handles ?? [],
    radioStreams: r.radio_streams ?? [],
  };
}

export async function saveListeningConfig(
  projectId: string,
  cfg: ListeningConfig,
): Promise<void> {
  if (!dbConfigured())
    throw new Error(
      "Supabase no configurado: no se puede guardar la configuración de escucha",
    );
  const { error } = await getSupabase().from("listening_config").upsert(
    {
      project_id: projectId,
      geo: { zona: cfg.zona, pais: cfg.pais },
      radio: cfg.radioKm,
      lat: cfg.lat,
      lng: cfg.lng,
      keywords: cfg.keywords,
      fuentes: cfg.fuentes,
      rss_feeds: cfg.rssFeeds,
      x_handles: cfg.xHandles,
      radio_streams: cfg.radioStreams,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id" },
  );
  if (error) throw error;
}
