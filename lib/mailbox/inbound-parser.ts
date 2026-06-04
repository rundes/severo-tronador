// Parser MIME para mail entrante (Cloudflare Email Workers → Vercel webhook).
//
// postal-mime es MIT, ~50KB, sin deps nativas. Maneja multipart, charsets,
// base64/quoted-printable. Suficiente para extraer headers + body text +
// from/to/subject que necesita reply-routing.
import PostalMime from "postal-mime";
import type { EmailAddress, EmailFull } from "./types";

interface PostalAddress {
  address?: string;
  name?: string;
}

interface PostalAttachment {
  filename?: string | null;
  mimeType?: string;
  disposition?: "attachment" | "inline" | null;
  contentId?: string;
  content?: ArrayBuffer | Uint8Array | string;
  encoding?: "base64" | "utf8";
}

interface PostalEmail {
  from?: PostalAddress | PostalAddress[];
  to?: PostalAddress[];
  cc?: PostalAddress[];
  subject?: string;
  date?: string;
  text?: string;
  html?: string;
  messageId?: string;
  attachments?: PostalAttachment[];
}

// Tope para imágenes inline embebidas como data: URI (evita filas gigantes en
// inbound_emails). ~2 MB por imagen; las más grandes se dejan como cid roto.
const MAX_INLINE_BYTES = 2_000_000;

function toBase64(
  content: ArrayBuffer | Uint8Array | string,
  encoding?: "base64" | "utf8",
): string {
  if (typeof content === "string") {
    return encoding === "base64"
      ? content
      : Buffer.from(content, "utf8").toString("base64");
  }
  const u8 = content instanceof Uint8Array ? content : new Uint8Array(content);
  return Buffer.from(u8).toString("base64");
}

// Allowlist de tipos de imagen embebibles. Excluye svg+xml (vector con script
// potencial) y cualquier mimeType arbitrario, que el remitente controla y
// podría usar para romper el atributo src="" (XSS por attribute breakout).
const INLINE_IMG_MIME = /^image\/(png|jpe?g|gif|webp|bmp)$/i;
// contentId también es atacante-controlado: solo chars seguros para el src.
const SAFE_CID = /^[A-Za-z0-9._@-]+$/;

// Reemplaza <img src="cid:xxx"> por data: URIs usando los adjuntos inline, así
// las imágenes embebidas (típico de Gmail/Outlook) se ven en la bandeja in-app
// sin tener que almacenar/servir adjuntos por separado. El HTML resultante se
// sanitiza aguas abajo (render) — acá validamos mimeType/contentId como defensa
// en profundidad para que el data: URI inyectado no rompa el atributo.
function inlineCidImages(html: string, attachments: PostalAttachment[]): string {
  let out = html;
  for (const att of attachments) {
    if (!att.contentId || !att.content) continue;
    if (!att.mimeType || !INLINE_IMG_MIME.test(att.mimeType)) continue;
    const id = att.contentId.replace(/^<|>$/g, "");
    if (!SAFE_CID.test(id)) continue;
    const b64 = toBase64(att.content, att.encoding);
    if (b64.length > (MAX_INLINE_BYTES * 4) / 3) continue; // base64 ~ 4/3 bytes
    if (!/^[A-Za-z0-9+/=]+$/.test(b64)) continue; // base64 puro, sin sorpresas
    const mime = att.mimeType.toLowerCase();
    out = out.split(`cid:${id}`).join(`data:${mime};base64,${b64}`);
  }
  return out;
}

function asAddress(a: PostalAddress | undefined): EmailAddress {
  return {
    email: a?.address ?? "(desconocido)",
    name: a?.name,
  };
}

function asAddresses(arr: PostalAddress[] | undefined): EmailAddress[] {
  return (arr ?? []).map((a) => asAddress(a));
}

// Convierte el raw RFC822 (string o Uint8Array) en nuestro EmailFull.
export async function parseRawEmail(raw: string | Uint8Array): Promise<EmailFull> {
  const parsed = (await PostalMime.parse(raw)) as PostalEmail;
  const fromRaw = Array.isArray(parsed.from)
    ? parsed.from[0]
    : parsed.from;
  const text = parsed.text ?? stripHtml(parsed.html ?? "");
  const html = parsed.html
    ? inlineCidImages(parsed.html, parsed.attachments ?? [])
    : undefined;
  return {
    id: parsed.messageId ?? cryptoRandomId(),
    threadId: parsed.messageId ?? cryptoRandomId(),
    mailboxIds: ["inbox"],
    from: asAddress(fromRaw),
    to: asAddresses(parsed.to),
    cc: parsed.cc ? asAddresses(parsed.cc) : undefined,
    subject: parsed.subject ?? "(sin asunto)",
    preview: text.slice(0, 120),
    receivedAt: parsed.date ?? new Date().toISOString(),
    isUnread: true,
    hasAttachment: (parsed.attachments ?? []).length > 0,
    bodyText: text,
    bodyHtml: html,
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cryptoRandomId(): string {
  return `inb-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
}
