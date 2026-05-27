import { dbConfigured, getSupabase } from "./supabase";
import type { Repository } from "./types";

export async function enqueueSheetSync(entity: string, op: string, payload: unknown) {
  if (!dbConfigured()) return; // sin DB no hay espejo
  await getSupabase().from("sheets_sync_queue").insert({ entity, op, payload });
}

interface MirrorOpts<T> {
  entity: string;
  enqueue?: (entity: string, op: string, payload: T) => Promise<void>;
}

export function withMirror<T extends { id?: string }>(
  base: Repository<T>,
  opts: MirrorOpts<T>,
): Repository<T> {
  const enq = opts.enqueue ?? ((e, o, p) => enqueueSheetSync(e, o, p));
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
