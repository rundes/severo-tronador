// JMAP client mínimo + mock fallback para el módulo Mail (Plan 04 F2).
// Si STALWART_URL no está configurado, todas las operaciones devuelven
// datos mock (lib/mailbox/mock-data.ts) para que la UI sea verificable
// antes del deploy real del server Stalwart.
//
// JMAP spec: https://jmap.io/spec-core.html
// Stalwart docs: https://stalw.art/docs/develop/api/jmap

import {
  MOCK_EMAILS,
  MOCK_MAILBOXES,
  mockMessageById,
  mockMessagesInMailbox,
} from "./mock-data";
import type {
  ComposeInput,
  EmailFull,
  EmailListItem,
  Mailbox,
  MailboxStatus,
  SendResult,
} from "./types";

interface Credentials {
  address: string;
  password: string;
}

export function isLiveMode(): boolean {
  return Boolean(process.env.STALWART_URL && process.env.STALWART_ADMIN_TOKEN);
}

function authHeader(creds: Credentials): string {
  const basic = Buffer.from(`${creds.address}:${creds.password}`, "utf8").toString(
    "base64",
  );
  return `Basic ${basic}`;
}

async function jmapCall(
  creds: Credentials,
  methodCalls: unknown[],
): Promise<unknown> {
  const url = `${process.env.STALWART_URL}/jmap/api`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(creds),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      using: [
        "urn:ietf:params:jmap:core",
        "urn:ietf:params:jmap:mail",
        "urn:ietf:params:jmap:submission",
      ],
      methodCalls,
    }),
  });
  if (!res.ok) throw new Error(`JMAP HTTP ${res.status}`);
  return res.json();
}

// ── Status: sin credenciales → mock. Con creds → live (cuenta unread). ──

export async function getMailboxStatus(
  creds?: Credentials,
): Promise<MailboxStatus> {
  if (!isLiveMode() || !creds) {
    const unread = MOCK_MAILBOXES.find((m) => m.role === "inbox")?.unreadCount ?? 0;
    return {
      configured: false,
      mode: "mock",
      address: creds?.address,
      unread,
    };
  }
  try {
    const mailboxes = await listMailboxes(creds);
    const inbox = mailboxes.find((m) => m.role === "inbox");
    return {
      configured: true,
      mode: "stalwart",
      address: creds.address,
      unread: inbox?.unreadCount ?? 0,
    };
  } catch {
    return { configured: false, mode: "mock", unread: 0 };
  }
}

// ── Mailboxes ──────────────────────────────────────────────────────────

export async function listMailboxes(creds?: Credentials): Promise<Mailbox[]> {
  if (!isLiveMode() || !creds) return MOCK_MAILBOXES;
  const response = (await jmapCall(creds, [
    ["Mailbox/get", { ids: null, properties: ["name", "role", "totalEmails", "unreadEmails"] }, "0"],
  ])) as { methodResponses?: unknown[][] };
  const list = (response.methodResponses?.[0]?.[1] ?? {}) as {
    list?: { id: string; name: string; role?: string; totalEmails?: number; unreadEmails?: number }[];
  };
  return (list.list ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    role: (m.role ?? "custom") as Mailbox["role"],
    unreadCount: m.unreadEmails ?? 0,
    totalCount: m.totalEmails ?? 0,
  }));
}

// ── Email list ─────────────────────────────────────────────────────────

export async function listMessages(
  mailboxId: string,
  creds?: Credentials,
): Promise<EmailListItem[]> {
  if (!isLiveMode() || !creds) return mockMessagesInMailbox(mailboxId);

  const response = (await jmapCall(creds, [
    ["Email/query", { filter: { inMailbox: mailboxId }, sort: [{ property: "receivedAt", isAscending: false }], limit: 50 }, "0"],
    [
      "Email/get",
      {
        "#ids": { resultOf: "0", name: "Email/query", path: "/ids" },
        properties: ["id", "threadId", "mailboxIds", "from", "to", "subject", "preview", "receivedAt", "hasAttachment", "keywords"],
      },
      "1",
    ],
  ])) as { methodResponses?: unknown[][] };
  const emails = (response.methodResponses?.[1]?.[1] ?? {}) as {
    list?: JmapEmail[];
  };
  return (emails.list ?? []).map(toEmailListItem);
}

interface JmapEmail {
  id: string;
  threadId: string;
  mailboxIds?: Record<string, boolean>;
  from?: { name?: string; email: string }[];
  to?: { name?: string; email: string }[];
  cc?: { name?: string; email: string }[];
  subject?: string;
  preview?: string;
  receivedAt?: string;
  hasAttachment?: boolean;
  keywords?: Record<string, boolean>;
  textBody?: { partId: string }[];
  htmlBody?: { partId: string }[];
  bodyValues?: Record<string, { value: string }>;
}

function toEmailListItem(e: JmapEmail): EmailListItem {
  return {
    id: e.id,
    threadId: e.threadId,
    mailboxIds: Object.keys(e.mailboxIds ?? {}),
    from: e.from?.[0] ?? { email: "(desconocido)" },
    to: e.to ?? [],
    subject: e.subject ?? "(sin asunto)",
    preview: e.preview ?? "",
    receivedAt: e.receivedAt ?? new Date().toISOString(),
    isUnread: !e.keywords?.["$seen"],
    hasAttachment: Boolean(e.hasAttachment),
  };
}

// ── Email full ─────────────────────────────────────────────────────────

export async function getMessage(
  id: string,
  creds?: Credentials,
): Promise<EmailFull | null> {
  if (!isLiveMode() || !creds) {
    const m = mockMessageById(id);
    return m ?? null;
  }
  const response = (await jmapCall(creds, [
    [
      "Email/get",
      {
        ids: [id],
        properties: [
          "id",
          "threadId",
          "mailboxIds",
          "from",
          "to",
          "cc",
          "subject",
          "preview",
          "receivedAt",
          "hasAttachment",
          "keywords",
          "bodyValues",
          "textBody",
          "htmlBody",
        ],
        fetchTextBodyValues: true,
        fetchHTMLBodyValues: true,
      },
      "0",
    ],
  ])) as { methodResponses?: unknown[][] };
  const data = (response.methodResponses?.[0]?.[1] ?? {}) as {
    list?: JmapEmail[];
  };
  const e = data.list?.[0];
  if (!e) return null;
  const list = toEmailListItem(e);
  const textPart = e.textBody?.[0]?.partId;
  const htmlPart = e.htmlBody?.[0]?.partId;
  return {
    ...list,
    cc: e.cc,
    bodyText: textPart ? e.bodyValues?.[textPart]?.value ?? "" : "",
    bodyHtml: htmlPart ? e.bodyValues?.[htmlPart]?.value : undefined,
  };
}

// ── Mark read (Plan 04 F5: cron de routing de replies) ────────────────

export async function markRead(
  emailId: string,
  creds?: Credentials,
): Promise<boolean> {
  if (!isLiveMode() || !creds) {
    const m = mockMessageById(emailId);
    if (m) m.isUnread = false;
    return Boolean(m);
  }
  try {
    await jmapCall(creds, [
      [
        "Email/set",
        { update: { [emailId]: { "keywords/$seen": true } } },
        "0",
      ],
    ]);
    return true;
  } catch {
    return false;
  }
}

// ── Compose / send ─────────────────────────────────────────────────────

export async function sendMail(
  input: ComposeInput,
  creds?: Credentials,
): Promise<SendResult> {
  if (!isLiveMode() || !creds) {
    // Mock: simula que se mandó OK.
    const fakeId = `mock-${Date.now()}`;
    MOCK_EMAILS.unshift({
      id: fakeId,
      threadId: `mock-thr-${fakeId}`,
      mailboxIds: ["sent"],
      from: { name: "Admin Tronador", email: "admin@tronador.net.ar" },
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      preview: input.bodyText.slice(0, 80),
      receivedAt: new Date().toISOString(),
      isUnread: false,
      hasAttachment: false,
      bodyText: input.bodyText,
      bodyHtml: input.bodyHtml,
    });
    return { ok: true, messageId: fakeId };
  }

  // JMAP submission: Email/set para crear el draft + EmailSubmission/set
  // para enviarlo. Simplificado.
  try {
    const draft = {
      mailboxIds: { drafts: true },
      from: [{ email: creds.address }],
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      keywords: { $draft: true },
      bodyValues: { body: { value: input.bodyText } },
      textBody: [{ partId: "body", type: "text/plain" }],
    };
    const create = (await jmapCall(creds, [
      ["Email/set", { create: { draft } }, "0"],
      [
        "EmailSubmission/set",
        {
          create: {
            sub: { "#emailId": { resultOf: "0", name: "Email/set", path: "/created/draft/id" } },
          },
          onSuccessUpdateEmail: {
            "#sub": { "mailboxIds/drafts": null, "mailboxIds/sent": true, "keywords/$draft": null, "keywords/$seen": true },
          },
        },
        "1",
      ],
    ])) as { methodResponses?: unknown[][] };
    const created = ((create.methodResponses?.[0]?.[1] ?? {}) as {
      created?: Record<string, { id: string }>;
    }).created?.draft;
    return { ok: true, messageId: created?.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
