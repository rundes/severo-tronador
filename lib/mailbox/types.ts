// Shape compartido del mailbox. Independiente del backend (Stalwart JMAP
// vs mock) — la UI consume estos tipos.

export interface Mailbox {
  id: string;
  name: string;
  role: "inbox" | "sent" | "drafts" | "trash" | "spam" | "archive" | "custom";
  unreadCount: number;
  totalCount: number;
}

export interface EmailAddress {
  name?: string;
  email: string;
}

export interface EmailListItem {
  id: string;
  threadId: string;
  mailboxIds: string[];
  from: EmailAddress;
  to: EmailAddress[];
  subject: string;
  preview: string;
  receivedAt: string;
  isUnread: boolean;
  hasAttachment: boolean;
}

export interface EmailFull extends EmailListItem {
  bodyHtml?: string;
  bodyText: string;
  cc?: EmailAddress[];
  replyTo?: EmailAddress;
}

export interface ComposeInput {
  to: EmailAddress[];
  cc?: EmailAddress[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  inReplyTo?: string;
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export interface MailboxStatus {
  configured: boolean; // STALWART_URL + provisioned credential
  mode: "stalwart" | "resend" | "mock";
  address?: string;
  unread: number;
}
