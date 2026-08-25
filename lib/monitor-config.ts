// Escenario de monitoreo electoral por proyecto (server-first). El plugin de
// Chrome NO tiene el escenario: lo baja como "plan de colecta" y solo navega
// y colecta. Todo lo específico del cliente (cuentas, búsquedas simétricas,
// calendario, memoria de errores) vive acá.
//
// Persistencia sin DDL: fila sintética de conector_config
// monitor-config:<projectId>. Ningún conector consulta ese connector_id.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { upsertConectorConfig } from "@/lib/db/conector-config";
import { log } from "@/lib/logger";

export type Platform = "instagram" | "x" | "facebook" | "tiktok";
// Categorías que NO se comparan entre sí en el informe (spec §8.1).
export type Category =
  | "organizacion"
  | "medio"
  | "individual"
  | "institucional"
  | "opera";

export interface MonitorAccount {
  handle: string;
  platform: Platform;
  category: Category;
  // Para medios: pertenencia política de un medio aparentemente neutral.
  vinculo?: string;
  nota?: string;
}

export interface CalendarEvent {
  label: string;
  date: string; // ISO date; la cuenta regresiva se expresa en días que faltan
}

export interface MonitorConfig {
  accounts: MonitorAccount[];
  // Búsquedas en las dos direcciones del conflicto (spec §7.5): términos
  // simétricos para no sesgar el mapa hacia un solo sector.
  searchesA: string[];
  searchesB: string[];
  calendar: CalendarEvent[];
  // Memoria de errores: correcciones del usuario que se inyectan al prompt
  // del informe para no repetir el mismo error (spec §6.1 no_repetir).
  noRepetir: string[];
  // Presupuesto anti-bloqueo por plataforma/día (spec §3.1). Conservador.
  budget: Record<Platform, { requests: number; pausaMinMs: number; pausaMaxMs: number }>;
  // Definiciones de lugares/personas/cargos para no confundir identidades
  // (spec §7.8): nombre → definición.
  entidades: Record<string, string>;
}

export const DEFAULT_BUDGET: MonitorConfig["budget"] = {
  instagram: { requests: 60, pausaMinMs: 6000, pausaMaxMs: 20000 },
  x: { requests: 35, pausaMinMs: 6000, pausaMaxMs: 20000 },
  facebook: { requests: 25, pausaMinMs: 8000, pausaMaxMs: 22000 },
  tiktok: { requests: 15, pausaMinMs: 8000, pausaMaxMs: 22000 },
};

const EMPTY: MonitorConfig = {
  accounts: [],
  searchesA: [],
  searchesB: [],
  calendar: [],
  noRepetir: [],
  budget: DEFAULT_BUDGET,
  entidades: {},
};

const key = (projectId: string) => `monitor-config:${projectId}`;

export async function getMonitorConfig(projectId: string): Promise<MonitorConfig> {
  if (!dbConfigured()) return { ...EMPTY };
  const { data } = await getSupabase()
    .from("conector_config")
    .select("config")
    .eq("connector_id", key(projectId))
    .maybeSingle();
  const cfg = data?.config as Partial<MonitorConfig> | undefined;
  if (!cfg) return { ...EMPTY };
  return {
    ...EMPTY,
    ...cfg,
    budget: { ...DEFAULT_BUDGET, ...(cfg.budget ?? {}) },
  };
}

export async function saveMonitorConfig(
  projectId: string,
  cfg: MonitorConfig,
): Promise<void> {
  if (!dbConfigured()) throw new Error("Supabase no configurado");
  try {
    await upsertConectorConfig(key(projectId), cfg);
  } catch (error) {
    log.warn("monitor_config.save_failed", { error: (error as Error).message });
    throw error;
  }
}

// Días que faltan para el próximo evento del calendario (cuenta regresiva).
export function nextCountdown(
  cfg: MonitorConfig,
  now = Date.now(),
): { label: string; days: number } | null {
  const upcoming = cfg.calendar
    .map((e) => ({ label: e.label, days: Math.ceil((+new Date(e.date) - now) / 86400_000) }))
    .filter((e) => Number.isFinite(e.days) && e.days >= 0)
    .sort((a, b) => a.days - b.days);
  return upcoming[0] ?? null;
}
