import { dbConfigured, getSupabase } from "./supabase";
import { log } from "@/lib/logger";
import type { Repository } from "./types";

// El espejo a Sheets es por proyecto: cada uno tiene su Sheet. `projectId` es
// obligatorio — mientras se omitía, la fila caía al DEFAULT de la columna y el
// dato de un tenant se drenaba al Sheet del proyecto default.
export async function enqueueSheetSync(
  projectId: string,
  entity: string,
  op: string,
  payload: unknown,
) {
  if (!dbConfigured()) return; // sin DB no hay espejo
  const { error } = await getSupabase()
    .from("sheets_sync_queue")
    .insert({ project_id: projectId, entity, op, payload });
  // El espejo es de preservación, no bloquea la operación — pero un fallo
  // silencioso deja el Sheet desincronizado sin que nadie se entere.
  if (error) {
    log.warn("mirror.enqueue_failed", { entity, op, error: error.message });
  }
}

interface MirrorOpts<T> {
  entity: string;
  projectId: string;
  enqueue?: (entity: string, op: string, payload: T) => Promise<void>;
}

export function withMirror<T extends { id?: string }>(
  base: Repository<T>,
  opts: MirrorOpts<T>,
): Repository<T> {
  const enq =
    opts.enqueue ?? ((e, o, p) => enqueueSheetSync(opts.projectId, e, o, p));
  return {
    list: base.list,
    get: base.get,
    async upsert(row) {
      const saved = await base.upsert(row);
      await enq(opts.entity, "upsert", saved);
      return saved;
    },
    async remove(id) {
      await base.remove(id);
      await enq(opts.entity, "remove", { id } as T);
    },
  };
}
