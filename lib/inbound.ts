// Resolver de mensajes entrantes (WhatsApp/SMS/Telegram). Ver
// docs/superpowers/specs/2026-06-27-inbound-2vias-design.md.
import { readPadronFromDb } from "@/lib/db/padron";
import { latestSurveyTokenForDni } from "@/lib/campaigns";
import { addResponse } from "@/lib/survey";
import { optOut as optOutContact } from "@/lib/optout";
import { DEFAULT_PROJECT_ID } from "@/lib/projects";
import { recordInbound, inboundExists } from "@/lib/inbound-store";

// Normaliza un teléfono a dígitos E.164 sin `+`, forzando prefijo país AR (54)
// si falta. Sirve para comparar el remitente entrante contra padron.telefono
// (cuyo formato puede variar). Devuelve null si no hay dígitos.
const AR_CC = "54";

export function normalizePhone(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  // Número local con 0 inicial (ej. 011...) → se quita el 0 antes de anteponer
  // el código de país, si no, quedaría 54011... en vez de 5411...
  // NOTA: no se resuelve el prefijo "15" (celular local sin código de área)
  // porque requiere conocer el código de área — fuera de alcance del MVP.
  if (!digits.startsWith(AR_CC) && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  // Si ya trae el código de país AR, se respeta. Si es un número local
  // (sin 54), se antepone. No intenta resolver otros países (MVP AR).
  if (!(digits.startsWith(AR_CC) && digits.length >= 11)) {
    digits = AR_CC + digits;
  }
  // Forma canónica: WhatsApp reporta móviles AR como 549XXXXXXXXXX (con el
  // "9" de móvil tras el código de país) pero el padrón suele tener
  // 54XXXXXXXXXX (sin el 9) o números locales sin 9. Se quita el 9 de móvil
  // para que ambos lados comparen igual.
  if (digits.startsWith(AR_CC + "9") && digits.length === AR_CC.length + 1 + 10) {
    digits = AR_CC + digits.slice(AR_CC.length + 1);
  }
  return digits;
}

// Keywords de baja (opt-out). Match EXACTO sobre el mensaje trim+upper para no
// confundir "no me des de baja" con una baja. Configurable acá.
const OPT_OUT_KEYWORDS = ["BAJA TOTAL", "BAJA", "STOP", "CANCELAR"] as const;

export function detectOptOut(body: string): string | null {
  const norm = (body ?? "").trim().toUpperCase();
  for (const kw of OPT_OUT_KEYWORDS) {
    if (norm === kw) return kw;
  }
  return null;
}

export const WINDOW_HOURS = 72;

// Resuelve dni por teléfono: normaliza ambos lados y compara. Trae el padrón
// del proyecto (inbound de bajo volumen → aceptable). Devuelve null sin match.
export async function resolveContactByPhone(
  projectId: string,
  phone: string,
): Promise<string | null> {
  const target = normalizePhone(phone);
  if (!target) return null;
  const contacts = await readPadronFromDb(projectId);
  const hit = contacts.find(
    (c) => normalizePhone((c as { telefono?: string }).telefono) === target,
  );
  return hit ? (hit as { dni: string }).dni : null;
}

export interface InboundInput {
  channel: "whatsapp" | "sms" | "telegram";
  senderExternalId: string;
  body: string;
  providerMessageId?: string;
  projectId?: string;
  dni?: string;
  raw?: unknown;
}

export interface InboundResult {
  stored: boolean;
  dni: string | null;
  optOut: boolean;
  responseToken: string | null;
}

export async function ingestInbound(
  input: InboundInput,
): Promise<InboundResult> {
  const projectId = input.projectId ?? DEFAULT_PROJECT_ID;
  const body = (input.body ?? "").trim();

  // Idempotencia: reintento del proveedor → no reprocesar.
  if (
    input.providerMessageId &&
    (await inboundExists(input.channel, input.providerMessageId))
  ) {
    return { stored: false, dni: input.dni ?? null, optOut: false, responseToken: null };
  }

  // Identidad: Telegram trae dni resuelto; teléfono se resuelve por padrón.
  let dni = input.dni ?? null;
  if (!dni && input.channel !== "telegram") {
    dni = await resolveContactByPhone(projectId, input.senderExternalId);
  }

  // Opt-out: prioridad sobre guardar respuesta.
  const keyword = detectOptOut(body);
  let optedOut = false;
  if (keyword && dni) {
    await optOutContact(projectId, dni, `${input.channel} ${keyword.toLowerCase()}`);
    optedOut = true;
  }

  // Contexto + respuesta derivada. Un body vacío (blank SMS, etc.) no debe
  // consumir el único slot de respuesta por token (addResponse dedupea 1 por
  // token) — si no, la respuesta real del contacto queda bloqueada.
  let responseToken: string | null = null;
  let campaignId: string | null = null;
  if (dni && !optedOut && body.length > 0) {
    const since = new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString();
    const ref = await latestSurveyTokenForDni(projectId, dni, since);
    if (ref) {
      const saved = await addResponse(ref.token, [
        { pregunta: `(vía ${input.channel})`, respuesta: body },
      ]);
      if (saved) {
        responseToken = ref.token;
        campaignId = ref.campaignId;
      }
    }
  }

  // Persistir crudo SIEMPRE (idempotente).
  const { inserted } = await recordInbound({
    project_id: projectId,
    channel: input.channel,
    sender_external_id: input.senderExternalId,
    dni,
    body,
    provider_message_id: input.providerMessageId ?? null,
    campaign_id: campaignId,
    respuesta_token: responseToken,
    is_opt_out: optedOut,
    raw: input.raw ?? null,
  });

  return { stored: inserted, dni, optOut: optedOut, responseToken };
}
