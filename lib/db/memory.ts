import type { Repository } from "./types";

// Fallback sin Supabase (dev). Store por tabla en globalThis para sobrevivir HMR.
const g = globalThis as unknown as { __memRepos?: Map<string, Map<string, unknown>> };
const repos = (g.__memRepos ??= new Map());

export function memoryRepo<T extends { id?: string }>(table: string): Repository<T> {
  const store = (repos.get(table) ?? repos.set(table, new Map()).get(table)) as Map<string, T>;
  return {
    async list() { return [...store.values()]; },
    async get(id) { return store.get(id); },
    async upsert(row) {
      const id = row.id ?? crypto.randomUUID();
      const saved = { ...row, id } as T;
      store.set(id, saved);
      return saved;
    },
    async remove(id) { store.delete(id); },
  };
}
