// Reconciliación activa de estados de entrega (#6 mejoras).
//
// Los webhooks de provider se pierden cada tanto; este módulo hace pull del
// estado real para corregir `envios.delivery`. Solo email (Resend expone
// GET /emails/{id}); WhatsApp Cloud es webhook-only y no se puede consultar,
// para ese canal el cron sigue midiendo divergencia y avisando.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { getConnectorConfig } from "@/lib/connectors/config";
import { updateEnvioStatus, type Envio } from "@/lib/campaigns";
import { log } from "@/lib/logger";

type Delivery = NonNullable<Envio["delivery"]>;

// Eventos terminales de Resend → delivery. Los intermedios (sent, queued,
// delivery_delayed) no corrigen nada: el mensaje sigue en tránsito.
export function mapResendEvent(event: string | undefined): Delivery | null {
  switch (event) {
    case "delivered":
      return "delivered";
    case "opened":
    case "clicked":
      return "read";
    case "bounced":
    case "complained":
    case "failed":
      return "failed";
    default:
      return null;
  }
}

export interface ReconcileResult {
  checked: number;
  corrected: number;
}

// Envíos más viejos que esto sin delivery son candidatos a webhook perdido.
const STALE_MS = 60 * 60 * 1000;
// Tope de consultas a Resend por corrida (el cron es horario; converge solo).
const BATCH = 50;

export async function reconcileResendDeliveries(
  limit: number = BATCH,
): Promise<ReconcileResult> {
  if (!dbConfigured()) return { checked: 0, corrected: 0 };

  const cfg = await getConnectorConfig("resend");
  const apiKey = cfg.RESEND_API_KEY;
  if (!apiKey) return { checked: 0, corrected: 0 };

  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();
  // Sin filtro por conector: envios no tiene columna connector_id (el filtro
  // original tiraba 42703 y el cron daba 500 en cada tick). Los ids de otros
  // providers devuelven 404 en la API de Resend y se saltean; agregar la
  // columna vía migración queda como follow-up (plan F1).
  const { data, error } = await getSupabase()
    .from("envios")
    .select("provider_message_id")
    .eq("estado", "sent")
    .not("provider_message_id", "is", null)
    .is("delivery", null)
    .lte("created_at", staleBefore)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  let checked = 0;
  let corrected = 0;
  for (const row of data ?? []) {
    const id = (row as { provider_message_id: string }).provider_message_id;
    checked++;
    try {
      const res = await fetch(`https://api.resend.com/emails/${id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { last_event?: string };
      const delivery = mapResendEvent(body.last_event);
      if (delivery && (await updateEnvioStatus(id, delivery))) corrected++;
    } catch (e) {
      // Un fallo puntual no corta el lote; el cron reintenta en la próxima.
      log.warn("reconcile.resend.lookup_failed", { id, error: String(e) });
    }
  }
  return { checked, corrected };
}
