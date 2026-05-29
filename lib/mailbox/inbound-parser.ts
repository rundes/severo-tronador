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

interface PostalEmail {
  from?: PostalAddress | PostalAddress[];
  to?: PostalAddress[];
  cc?: PostalAddress[];
  subject?: string;
  date?: string;
  text?: string;
  html?: string;
  messageId?: string;
  attachments?: { filename?: string }[];
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
    bodyHtml: parsed.html,
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
