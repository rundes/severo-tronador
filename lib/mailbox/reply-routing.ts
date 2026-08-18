// Auto-routing de replies (Plan 04 F5).
//
// Para cada email entrante en el mailbox de replies:
//   1. Extraer token de la dirección "To:" (plus-addressing).
//   2. Buscar envio por token → obtener campaign_id + dni.
//   3. Persistir el body como respuesta cualitativa con kind=email_reply.
//   4. Marcar el message como leído (idempotencia).
//
// Sin Supabase corre en modo dry-run: parsea pero no persiste.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { log, tokenTag } from "@/lib/logger";
import { detectOptOut } from "@/lib/inbound";
import { optOut } from "@/lib/optout";
import type { EmailFull } from "./types";
import { extractTokenFromAddress } from "./reply-address";

export interface RoutedReply {
  ok: boolean;
  reason?:
    | "no_to_address"
    | "no_token"
    | "envio_not_found"
    | "duplicate"
    | "opt_out"
    | "db_error";
  envioToken?: string;
  campaignId?: string;
  projectId?: string;
  dni?: string;
  respuestaId?: string;
}

interface EnvioRow {
  project_id: string;
  campaign_id: string;
  dni: string | null;
  token: string;
}

interface RespuestaRow {
  id: string;
  token: string;
}

// Primera línea con contenido del reply, ignorando texto citado (`>`) y la
// firma. Un mail no es un SMS: el body trae el hilo citado abajo, así que
// buscar la keyword sobre el body entero (match exacto) nunca daría. La
// intención de baja viaja en lo primero que la persona escribe.
export function firstMeaningfulLine(body: string): string {
  for (const raw of (body ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(">")) continue;
    return line;
  }
  return "";
}

// Procesa UN mail. Idempotente: si ya existe respuesta para ese token
// con la misma fecha, no duplica.
export async function routeReply(email: EmailFull): Promise<RoutedReply> {
  const toAddr = email.to?.[0]?.email;
  if (!toAddr) return { ok: false, reason: "no_to_address" };

  const token = extractTokenFromAddress(toAddr);
  if (!token) return { ok: false, reason: "no_token" };

  if (!dbConfigured()) {
    log.info("mail.reply.dry_run", { token: tokenTag(token), subject: email.subject });
    return { ok: true, envioToken: token };
  }

  const sb = getSupabase();
  const { data: envio, error: envioErr } = await sb
    .from("envios")
    .select("project_id, campaign_id, dni, token")
    .eq("token", token)
    .maybeSingle();
  if (envioErr) {
    log.warn("mail.reply.envio_lookup_failed", {
      token,
      error: envioErr.message,
    });
    return { ok: false, reason: "db_error", envioToken: token };
  }
  const row = envio as EnvioRow | null;
  if (!row) {
    log.warn("mail.reply.envio_not_found", { token: tokenTag(token) });
    return { ok: false, reason: "envio_not_found", envioToken: token };
  }

  // Opt-out por mail: "BAJA" respondiendo a una campaña se guardaba como
  // respuesta cualitativa y la persona seguía recibiendo. La baja tiene
  // prioridad sobre persistir la respuesta y va antes del dedupe (optOut es
  // idempotente, así que un reenvío del proveedor la vuelve a aplicar sin daño).
  const keyword = detectOptOut(firstMeaningfulLine(email.bodyText));
  if (keyword) {
    if (row.dni) {
      await optOut(row.project_id, row.dni, `email ${keyword.toLowerCase()}`);
      log.info("mail.reply.opt_out", {
        token: tokenTag(token),
        dni: row.dni,
        campaign_id: row.campaign_id,
      });
    } else {
      log.warn("mail.reply.opt_out.unmatched", { token: tokenTag(token), from: email.from.email });
    }
    return {
      ok: true,
      reason: "opt_out",
      envioToken: token,
      campaignId: row.campaign_id,
      projectId: row.project_id,
      dni: row.dni ?? undefined,
    };
  }

  // Dedupe por (token + message_id si tenemos, sino por mismo body).
  // Cobramos el barato: token + 1 row por reply normalmente alcanza.
  // El UNIQUE en respuestas(token) garantiza idempotencia básica.
  const { data: existing } = await sb
    .from("respuestas")
    .select("id")
    .eq("token", token)
    .maybeSingle();

  if (existing) {
    return {
      ok: false,
      reason: "duplicate",
      envioToken: token,
      campaignId: row.campaign_id,
      projectId: row.project_id,
      dni: row.dni ?? undefined,
      respuestaId: (existing as RespuestaRow).id,
    };
  }

  const answers = [
    {
      kind: "email_reply",
      subject: email.subject,
      body: email.bodyText.slice(0, 8000),
      received_at: email.receivedAt,
      from: email.from.email,
    },
  ];

  const { data: inserted, error: insErr } = await sb
    .from("respuestas")
    .insert({
      token,
      project_id: row.project_id,
      campaign_id: row.campaign_id,
      dni: row.dni,
      answers,
    })
    .select("id")
    .single();

  if (insErr) {
    log.warn("mail.reply.insert_failed", { token: tokenTag(token), error: insErr.message });
    return { ok: false, reason: "db_error", envioToken: token };
  }

  log.info("mail.reply.routed", {
    token,
    campaign_id: row.campaign_id,
    dni: row.dni,
  });

  return {
    ok: true,
    envioToken: token,
    campaignId: row.campaign_id,
    projectId: row.project_id,
    dni: row.dni ?? undefined,
    respuestaId: (inserted as RespuestaRow).id,
  };
}
