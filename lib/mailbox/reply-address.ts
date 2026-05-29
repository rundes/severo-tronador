// Genera y parsea reply-to addresses con plus-addressing para routing
// de respuestas (Plan 04 F5).
//
// Patrón:  replies+<token>@tronador.net.ar
// El "+token" lo respetan SMTP y JMAP (LDH set). Stalwart por default
// rutea cualquier alias plus al mailbox base si no hay alias explícito.

const DEFAULT_LOCAL = "replies";
const DEFAULT_DOMAIN = "tronador.net.ar";

function domain(): string {
  return process.env.MAIL_REPLIES_DOMAIN ?? DEFAULT_DOMAIN;
}

function localPart(): string {
  return process.env.MAIL_REPLIES_LOCAL ?? DEFAULT_LOCAL;
}

export function isRepliesConfigured(): boolean {
  // El feature requiere haber configurado el dominio aunque sea por default.
  // Pero pedimos un opt-in explícito para no romper deploys que no quieran
  // mail aún.
  return Boolean(process.env.MAIL_REPLIES_ENABLED);
}

// Construye reply-to para un envío dado.
export function buildReplyTo(envioToken: string): string {
  return `${localPart()}+${envioToken}@${domain()}`;
}

// Address base del mailbox que recibe los replies (sin plus).
export function repliesMailboxAddress(): string {
  return `${localPart()}@${domain()}`;
}

// Extrae el token de una address con plus-addressing. Soporta tanto
// "replies+TOKEN@dominio" como "Name <replies+TOKEN@dominio>" y respeta
// case-insensitive en el local-part.
export function extractTokenFromAddress(raw: string): string | null {
  const m = raw.match(/<?\s*([^\s@<>]+)@([^\s>]+?)\s*>?$/);
  if (!m) return null;
  const [, local, dom] = m;
  if (dom.toLowerCase() !== domain().toLowerCase()) return null;
  const expectLocal = localPart().toLowerCase();
  const lc = local.toLowerCase();
  if (!lc.startsWith(`${expectLocal}+`)) return null;
  const token = local.slice(expectLocal.length + 1);
  return token || null;
}
