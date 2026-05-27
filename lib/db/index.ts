import { dbConfigured } from "./supabase";
import { supabaseRepo } from "./repo";
import { memoryRepo } from "./memory";
import { withMirror } from "./mirror";
import type { Repository } from "./types";

// Repo para una tabla: Supabase si está configurado, memoria si no.
// mirror=true envuelve con espejo a Sheets (solo cuando hay Supabase).
export function repo<T extends { id?: string }>(table: string, mirror = false): Repository<T> {
  const base = dbConfigured() ? supabaseRepo<T>(table) : memoryRepo<T>(table);
  return mirror && dbConfigured() ? withMirror(base, { entity: table }) : base;
}
