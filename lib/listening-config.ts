import { dbConfigured, getSupabase } from "@/lib/db/supabase";

export interface ListeningConfig {
  zona: string;
  pais: string;
  radioKm: number | null;
  keywords: string[];
  fuentes: string[];
}

const DEFAULT: ListeningConfig = {
  zona: "", pais: "AR", radioKm: null, keywords: [], fuentes: [],
};

interface Row {
  geo: { zona?: string; pais?: string } | null;
  radio: number | null;
  keywords: string[] | null;
  fuentes: string[] | null;
}

export async function getListeningConfig(): Promise<ListeningConfig> {
  if (!dbConfigured()) return { ...DEFAULT };
  const { data } = await getSupabase()
    .from("listening_config").select("*").eq("id", 1).maybeSingle();
  if (!data) return { ...DEFAULT };
  const r = data as Row;
  return {
    zona: r.geo?.zona ?? "",
    pais: r.geo?.pais ?? "AR",
    radioKm: r.radio ?? null,
    keywords: r.keywords ?? [],
    fuentes: r.fuentes ?? [],
  };
}

export async function saveListeningConfig(cfg: ListeningConfig): Promise<void> {
  if (!dbConfigured()) throw new Error("Supabase no configurado: no se puede guardar la configuración de escucha");
  const { error } = await getSupabase().from("listening_config").upsert(
    {
      id: 1,
      geo: { zona: cfg.zona, pais: cfg.pais },
      radio: cfg.radioKm,
      keywords: cfg.keywords,
      fuentes: cfg.fuentes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}
