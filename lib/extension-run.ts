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
  return (data?.config as ExtensionRun | undefined) ?? null;
}
