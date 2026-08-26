// Resumen de la última corrida de la extensión, por proyecto. Persistencia
// sin DDL: fila sintética de conector_config extension-run:<projectId>.
// Sin esto el operador y el soporte quedan a ciegas: Instagram devolvió 400
// durante días sin que nadie lo viera.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { upsertConectorConfig } from "@/lib/db/conector-config";
import { log } from "@/lib/logger";

export interface ExtensionRunError {
  platform: string;
  handle?: string;
  step: string;
  detail: string;
}

export interface ExtensionRunInput {
  cuentas: number;
  busquedas: number;
  items: number;
  candidatos: number;
  sugeridos: number;
  errores: ExtensionRunError[];
}

export interface ExtensionRun extends ExtensionRunInput {
  at: string;
}

const MAX_ERRORES = 50;
const key = (projectId: string) => `extension-run:${projectId}`;

export async function saveExtensionRun(
  projectId: string,
  run: ExtensionRunInput,
): Promise<void> {
  if (!dbConfigured()) return;
  try {
    await upsertConectorConfig(key(projectId), {
      ...run,
      errores: run.errores.slice(0, MAX_ERRORES),
      at: new Date().toISOString(),
    });
  } catch (error) {
    log.warn("extension_run.save_failed", { error: (error as Error).message });
  }
}

export async function readExtensionRun(
  projectId: string,
): Promise<ExtensionRun | null> {
  if (!dbConfigured()) return null;
  const { data } = await getSupabase()
    .from("conector_config")
    .select("config")
    .eq("connector_id", key(projectId))
    .maybeSingle();
  return normalizeRun(data?.config);
}

// La fila la escribió otra versión del servidor o alguien a mano: el panel
// no puede caerse por un contador que llegó como string o un errores que no
// es array. Nunca lanza; devuelve null sólo si no hay objeto.
const toCount = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

function normalizeError(e: unknown): ExtensionRunError | null {
  if (!e || typeof e !== "object") return null;
  const r = e as Record<string, unknown>;
  const platform = str(r.platform);
  const step = str(r.step);
  const detail = str(r.detail);
  if (!platform || !step || detail === undefined) return null;
  const handle = str(r.handle);
  return handle === undefined ? { platform, step, detail } : { platform, handle, step, detail };
}

export function normalizeRun(raw: unknown): ExtensionRun | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const errores = Array.isArray(r.errores)
    ? r.errores.map(normalizeError).filter((e): e is ExtensionRunError => e !== null).slice(0, MAX_ERRORES)
    : [];
  return {
    cuentas: toCount(r.cuentas),
    busquedas: toCount(r.busquedas),
    items: toCount(r.items),
    candidatos: toCount(r.candidatos),
    sugeridos: toCount(r.sugeridos),
    errores,
    at: str(r.at) ?? "",
  };
}
