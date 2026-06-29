// Resolver de mensajes entrantes (WhatsApp/SMS/Telegram). Ver
// docs/superpowers/specs/2026-06-27-inbound-2vias-design.md.

// Normaliza un teléfono a dígitos E.164 sin `+`, forzando prefijo país AR (54)
// si falta. Sirve para comparar el remitente entrante contra padron.telefono
// (cuyo formato puede variar). Devuelve null si no hay dígitos.
const AR_CC = "54";

export function normalizePhone(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  // Si ya trae el código de país AR, se respeta. Si es un número local
  // (sin 54), se antepone. No intenta resolver otros países (MVP AR).
  if (digits.startsWith(AR_CC) && digits.length >= 11) return digits;
  return AR_CC + digits;
}
