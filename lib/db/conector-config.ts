// Upsert de filas SINTÉTICAS de conector_config (monitor-config:<pid>,
// daily-report:<pid>, extension-token:<pid>, listening-pull:<pid>,
// monitor-breaker:<pid>, brief:<pid>): persistencia sin DDL por proyecto.
//
// La unique de la tabla es (connector_id, project_id) NULLS NOT DISTINCT
// (migración 0053). Estas filas van con project_id NULL, así que el
// conflicto se declara sobre AMBAS columnas; con "connector_id" solo
// Postgres responde 42P10. Centralizado acá para que ningún call site lo
// vuelva a escribir a mano.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";

export async function upsertConectorConfig(
  connectorId: string,
  config: unknown,
): Promise<void> {
  if (!dbConfigured()) throw new Error("Supabase no configurado");
  const { error } = await getSupabase().from("conector_config").upsert(
    {
      connector_id: connectorId,
      project_id: null,
      config,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connector_id,project_id" },
  );
  if (error) throw error;
}
