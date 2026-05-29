// Cron de auto-routing de replies (Plan 04 F5).
//
// Recorre los unread del mailbox "replies@tronador.net.ar" — uno por
// envío que tuvo respuesta — y los persiste en la tabla respuestas con
// kind=email_reply. Marca cada mensaje como leído al terminar.
//
// El mailbox `replies@…` debe estar provisionado (Stalwart Admin API
// con secrets de env MAIL_REPLIES_USER/MAIL_REPLIES_PASSWORD), o usar
// catchall plus-addressing apuntando al user admin.
import { listMessages, getMessage, markRead, isLiveMode } from "./jmap-client";
import { routeReply, type RoutedReply } from "./reply-routing";
import { log } from "@/lib/logger";

export interface MailSyncSummary {
  scanned: number;
  routed: number;
  duplicates: number;
  no_token: number;
  envio_not_found: number;
  errors: number;
  mode: "live" | "mock" | "skipped";
}

function repliesCreds():
  | { address: string; password: string }
  | undefined {
  const user = process.env.MAIL_REPLIES_USER;
  const pass = process.env.MAIL_REPLIES_PASSWORD;
  if (!user || !pass) return undefined;
  return { address: user, password: pass };
}

// Ejecuta una pasada de sync. Procesa hasta `limit` mensajes unread del
// inbox del mailbox configurado en MAIL_REPLIES_USER.
export async function syncReplies(
  limit = 50,
): Promise<MailSyncSummary> {
  const summary: MailSyncSummary = {
    scanned: 0,
    routed: 0,
    duplicates: 0,
    no_token: 0,
    envio_not_found: 0,
    errors: 0,
    mode: isLiveMode() ? "live" : "mock",
  };

  const creds = repliesCreds();
  // En live mode sin creds del mailbox de replies, no podemos pullear.
  if (isLiveMode() && !creds) {
    summary.mode = "skipped";
    log.warn("mail.sync.skipped", {
      reason: "MAIL_REPLIES_USER/PASSWORD ausentes",
    });
    return summary;
  }

  const list = await listMessages("inbox", creds);
  const unread = list.filter((m) => m.isUnread).slice(0, limit);

  for (const m of unread) {
    summary.scanned++;
    const full = await getMessage(m.id, creds);
    if (!full) {
      summary.errors++;
      continue;
    }
    const result: RoutedReply = await routeReply(full);
    if (result.ok) {
      summary.routed++;
      await markRead(m.id, creds);
    } else if (result.reason === "duplicate") {
      summary.duplicates++;
      // Mark read igual — ya estaba procesado.
      await markRead(m.id, creds);
    } else if (result.reason === "no_token") {
      summary.no_token++;
    } else if (result.reason === "envio_not_found") {
      summary.envio_not_found++;
    } else {
      summary.errors++;
    }
  }

  log.info("mail.sync.tick", { ...summary });
  return summary;
}
