import { getSupabase } from "./supabase";
import type { Repository } from "./types";

export function supabaseRepo<T extends { id?: string }>(table: string): Repository<T> {
  return {
    async list() {
      const { data, error } = await getSupabase().from(table).select("*");
      if (error) throw error;
      return (data ?? []) as T[];
    },
    async get(id) {
      const { data, error } = await getSupabase().from(table).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data ?? undefined) as T | undefined;
    },
    async upsert(row) {
      const { data, error } = await getSupabase().from(table).upsert(row).select().single();
      if (error) throw error;
      return data as T;
    },
    async remove(id) {
      const { error } = await getSupabase().from(table).delete().eq("id", id);
      if (error) throw error;
    },
  };
}
