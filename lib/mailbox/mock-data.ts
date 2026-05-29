// Dataset mock para el módulo Mail mientras Stalwart no está desplegado.
// La UI corre contra estos datos para poder validar UX antes del rollout
// del VPS.

import type { EmailFull, Mailbox } from "./types";

const NOW = Date.UTC(2026, 4, 28, 14, 0, 0);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const iso = (offset: number) => new Date(NOW - offset).toISOString();

export const MOCK_MAILBOXES: Mailbox[] = [
  { id: "inbox", name: "Bandeja de entrada", role: "inbox", unreadCount: 3, totalCount: 24 },
  { id: "sent", name: "Enviados", role: "sent", unreadCount: 0, totalCount: 18 },
  { id: "drafts", name: "Borradores", role: "drafts", unreadCount: 0, totalCount: 2 },
  { id: "archive", name: "Archivo", role: "archive", unreadCount: 0, totalCount: 156 },
  { id: "trash", name: "Papelera", role: "trash", unreadCount: 0, totalCount: 7 },
];

export const MOCK_EMAILS: EmailFull[] = [
  {
    id: "msg-1",
    threadId: "thr-1",
    mailboxIds: ["inbox"],
    from: { name: "María Rodríguez", email: "maria@vecinos-centro.org" },
    to: [{ email: "admin@tronador.net.ar" }],
    subject: "Re: Encuesta sobre transporte público en el barrio",
    preview: "Hola, recibí su consulta sobre la línea 60. Comparto los datos que tenemos del último relevamiento…",
    receivedAt: iso(2 * HOUR),
    isUnread: true,
    hasAttachment: true,
    bodyText:
      "Hola,\n\nRecibí su consulta sobre la línea 60. Comparto los datos que tenemos del último relevamiento que hicimos en el barrio, incluyendo frecuencias percibidas y horarios pico.\n\nQuedo a disposición para coordinar una reunión si necesitan más contexto cualitativo.\n\nSaludos,\nMaría",
  },
  {
    id: "msg-2",
    threadId: "thr-2",
    mailboxIds: ["inbox"],
    from: { name: "Centro de Estudios Políticos y Electorales", email: "notifications@cpelectoral.org" },
    to: [{ email: "admin@tronador.net.ar" }],
    subject: "Aprobación pendiente: Meta Content Library",
    preview: "Estimado equipo, les recordamos que la aplicación a Meta Content Library está en revisión. Próximos pasos…",
    receivedAt: iso(8 * HOUR),
    isUnread: true,
    hasAttachment: false,
    bodyText:
      "Estimado equipo,\n\nLes recordamos que la aplicación a Meta Content Library está en revisión. Próximos pasos:\n\n1. Recibirán un email de Meta solicitando documentación adicional.\n2. La aprobación final puede tomar 2-4 semanas.\n3. Una vez aprobado, podrán configurar el connector en Tronador.\n\nSaludos,\nEquipo CPEE",
  },
  {
    id: "msg-3",
    threadId: "thr-3",
    mailboxIds: ["inbox"],
    from: { name: "Resend", email: "noreply@resend.com" },
    to: [{ email: "admin@tronador.net.ar" }],
    subject: "Domain tronador.net.ar verified",
    preview: "Your domain tronador.net.ar has been verified successfully. You can now send emails from this domain.",
    receivedAt: iso(DAY),
    isUnread: true,
    hasAttachment: false,
    bodyText:
      "Your domain tronador.net.ar has been verified successfully.\n\nYou can now send emails from this domain via the Resend API.",
  },
  {
    id: "msg-4",
    threadId: "thr-4",
    mailboxIds: ["inbox"],
    from: { name: "Junta Vecinal Sur", email: "junta-sur@vecinos.org" },
    to: [{ email: "admin@tronador.net.ar" }],
    subject: "Consulta sobre relevamiento de alumbrado público",
    preview: "Buenas tardes, escribimos desde la Junta Vecinal Sur. Queremos coordinar el relevamiento de alumbrado…",
    receivedAt: iso(2 * DAY),
    isUnread: false,
    hasAttachment: false,
    bodyText:
      "Buenas tardes,\n\nEscribimos desde la Junta Vecinal Sur. Queremos coordinar el relevamiento de alumbrado público que mencionaron en la última reunión.\n\nTenemos disponibilidad la próxima semana. ¿Cuándo les viene bien?\n\nSaludos cordiales,\nJunta Vecinal Sur",
  },
  {
    id: "msg-5",
    threadId: "thr-5",
    mailboxIds: ["sent"],
    from: { name: "Admin Tronador", email: "admin@tronador.net.ar" },
    to: [{ email: "investigacion@cpelectoral.org" }],
    subject: "Reporte semanal de menciones región AMBA",
    preview: "Adjunto el reporte semanal con la distribución de menciones por canal y los temas emergentes detectados…",
    receivedAt: iso(3 * DAY),
    isUnread: false,
    hasAttachment: true,
    bodyText:
      "Hola equipo,\n\nAdjunto el reporte semanal con la distribución de menciones por canal y los temas emergentes detectados esta semana.\n\nTop 3:\n1. Transporte público (35%)\n2. Seguridad (28%)\n3. Alumbrado (12%)\n\nSaludos,\nAdmin",
  },
];

export function mockMessagesInMailbox(mailboxId: string) {
  return MOCK_EMAILS.filter((e) => e.mailboxIds.includes(mailboxId));
}

export function mockMessageById(id: string) {
  return MOCK_EMAILS.find((e) => e.id === id);
}
