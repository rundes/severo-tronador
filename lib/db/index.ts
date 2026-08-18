import { dbConfigured } from "./supabase";
import { supabaseRepo } from "./repo";
import { memoryRepo } from "./memory";
import { withMirror } from "./mirror";
import type { Repository } from "./types";

// Repo para una tabla: Supabase si está configurado, memoria si no.
// `mirrorProjectId` envuelve con espejo a Sheets del proyecto (solo con
// Supabase). El espejo necesita saber a qué Sheet va, así que no hay forma de
// pedirlo sin decir de qué proyecto es.
export function repo<T extends { id?: string }>(
  table: string,
  mirrorProjectId?: string,
): Repository<T> {
  const base = dbConfigured() ? supabaseRepo<T>(table) : memoryRepo<T>(table);
  return mirrorProjectId && dbConfigured()
    ? withMirror(base, { entity: table, projectId: mirrorProjectId })
    : base;
}
