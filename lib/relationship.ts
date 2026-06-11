// Modelo de fidelización — ficha de relación + health score (ARCHITECTURE §5).
// La unidad atómica es el contacto, no la campaña. En F2 todavía no hay envíos
// reales, así que el historial sale del mock (lib/mock/relaciones.ts); la
// maquinaria de cálculo es la definitiva.

export type Channel = "email" | "whatsapp" | "sms" | "voice" | "telegram" | "meta-ad";

// Canales de outreach (mensajería directa). "meta-ad" queda fuera: no tiene
// conector de envío, no usa cooldown ni historial de relación.
export const CHANNELS: Channel[] = ["email", "whatsapp", "sms", "voice", "telegram"];

// Cooldown mínimo entre contactos por canal, en días (§5.2). Se reduce a la
// mitad si la persona respondió al último contacto del canal.
export const COOLDOWN_DAYS: Record<Channel, number> = {
  email: 14,
  whatsapp: 30,
  telegram: 7,
  sms: 30,
  voice: 60,
  // meta-ad no tiene cooldown de relación (sin envíos directos a contactos).
  "meta-ad": 0,
};

// ── Historial crudo (lo que en producción saldría de la hoja `envios`) ──────
export interface ContactEvent {
  channel: Channel;
  contactedAt: string; // ISO
  respondedAt?: string; // ISO; ausente = no respondió
  complained?: boolean;
}

export interface RawRelationship {
  dni: string;
  events: ContactEvent[];
  optOuts: { channel: Channel; at: string; reason?: string }[];
}

// ── Ficha derivada ──────────────────────────────────────────────────────────
export interface ChannelState {
  available: boolean;
  lastContactedAt?: string;
  lastRespondedAt?: string;
  nextAvailableAt?: string;
}

export type RelationshipStatus =
  | "available"
  | "cooling_down"
  | "opted_out"
  | "unresponsive";

export interface ContactRelationship {
  dni: string;
  totalContactsMade: number;
  totalResponses: number;
  responseRate: number; // 0..1
  channels: Partial<Record<Channel, ChannelState>>;
  preferredChannel: Channel | null;
  healthScore: number; // 0..100
  status: RelationshipStatus;
  nextAvailableAt: string | null; // ISO, null = disponible ya
  optOuts: { channel: Channel; at: string; reason?: string }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Edad en años a partir de fecha_nac (ISO). Etiqueta lista para UI.
export function edadLabel(fechaNac?: string, now = Date.now()): string {
  if (!fechaNac) return "edad —";
  const d = new Date(fechaNac);
  if (Number.isNaN(d.getTime())) return "edad —";
  const nowD = new Date(now);
  let age = nowD.getUTCFullYear() - d.getUTCFullYear();
  const m = nowD.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && nowD.getUTCDate() < d.getUTCDate())) age--;
  return `${age} años`;
}

function daysBetween(a: number, b: number): number {
  return Math.abs(a - b) / DAY_MS;
}

// Cuántos contactos seguidos al final del historial quedaron sin respuesta.
function consecutiveUnanswered(events: ContactEvent[]): number {
  const sorted = [...events].sort(
    (x, y) => +new Date(y.contactedAt) - +new Date(x.contactedAt),
  );
  let n = 0;
  for (const e of sorted) {
    if (e.respondedAt) break;
    n++;
  }
  return n;
}

// Health score (§5.3). Transparente y on-read (no se persiste).
export function healthScore(raw: RawRelationship | undefined, now = Date.now()): number {
  if (!raw || raw.events.length === 0) return 100;
  const events = raw.events;
  const hasEverResponded = events.some((e) => e.respondedAt);
  const hasComplained = events.some((e) => e.complained);
  const lastContact = Math.max(...events.map((e) => +new Date(e.contactedAt)));
  const respondedInLast90Days = events.some(
    (e) => e.respondedAt && daysBetween(now, +new Date(e.respondedAt)) <= 90,
  );

  let score = 100;
  score -= 20 * consecutiveUnanswered(events);
  score += 30 * (hasEverResponded ? 1 : 0);
  score -= 50 * (hasComplained ? 1 : 0);
  score -= (10 * daysBetween(now, lastContact)) / 365;
  score += 20 * (respondedInLast90Days ? 1 : 0);

  return Math.max(0, Math.min(100, Math.round(score)));
}

export type HealthBand = "green" | "yellow" | "red";

export function healthBand(score: number): HealthBand {
  if (score >= 80) return "green";
  if (score >= 40) return "yellow";
  return "red";
}

// ¿Se puede contactar a esta persona por este canal HOY? Sin historial en el
// canal, está disponible salvo opt-out explícito.
export function channelAvailable(
  rel: ContactRelationship,
  ch: Channel,
): boolean {
  const st = rel.channels[ch];
  if (st) return st.available;
  return !rel.optOuts.some((o) => o.channel === ch);
}

function deriveChannelState(
  channel: Channel,
  raw: RawRelationship,
  now: number,
): ChannelState | undefined {
  const evs = raw.events
    .filter((e) => e.channel === channel)
    .sort((a, b) => +new Date(b.contactedAt) - +new Date(a.contactedAt));
  const optedOut = raw.optOuts.some((o) => o.channel === channel);
  if (evs.length === 0) {
    return optedOut ? { available: false } : { available: true };
  }
  const last = evs[0];
  const respondedToLast = Boolean(last.respondedAt);
  const cooldown = COOLDOWN_DAYS[channel] * (respondedToLast ? 0.5 : 1);
  const nextAt = +new Date(last.contactedAt) + cooldown * DAY_MS;
  const lastRespondedAt = evs.find((e) => e.respondedAt)?.respondedAt;
  return {
    available: !optedOut && now >= nextAt,
    lastContactedAt: last.contactedAt,
    lastRespondedAt,
    nextAvailableAt: new Date(nextAt).toISOString(),
  };
}

// Infiere el canal preferido tras ≥3 contactos: el de mayor ratio respondió/contactó (§5.4).
function inferPreferred(raw: RawRelationship): Channel | null {
  if (raw.events.length < 3) return null;
  let best: { channel: Channel; ratio: number } | null = null;
  for (const ch of CHANNELS) {
    const evs = raw.events.filter((e) => e.channel === ch);
    if (evs.length === 0) continue;
    const ratio = evs.filter((e) => e.respondedAt).length / evs.length;
    if (!best || ratio > best.ratio) best = { channel: ch, ratio };
  }
  return best && best.ratio > 0 ? best.channel : null;
}

export function deriveRelationship(
  dni: string,
  raw: RawRelationship | undefined,
  now = Date.now(),
): ContactRelationship {
  if (!raw || raw.events.length === 0) {
    return {
      dni,
      totalContactsMade: 0,
      totalResponses: 0,
      responseRate: 0,
      channels: {},
      preferredChannel: null,
      healthScore: 100,
      status: "available",
      nextAvailableAt: null,
      optOuts: [],
    };
  }

  const totalContactsMade = raw.events.length;
  const totalResponses = raw.events.filter((e) => e.respondedAt).length;
  const channels: Partial<Record<Channel, ChannelState>> = {};
  for (const ch of CHANNELS) {
    const state = deriveChannelState(ch, raw, now);
    if (state) channels[ch] = state;
  }

  const nextTimes = Object.values(channels)
    .filter((c) => !c.available && c.nextAvailableAt)
    .map((c) => +new Date(c.nextAvailableAt!));
  const anyAvailable = Object.values(channels).some((c) => c.available);
  const nextAvailableAt = anyAvailable
    ? null
    : nextTimes.length
      ? new Date(Math.min(...nextTimes)).toISOString()
      : null;

  // Opt-out de todos los canales conocidos ⇒ opted_out.
  const optedOutAll =
    raw.optOuts.length > 0 &&
    CHANNELS.every((ch) => raw.optOuts.some((o) => o.channel === ch));

  let status: RelationshipStatus = "available";
  if (optedOutAll) status = "opted_out";
  else if (consecutiveUnanswered(raw.events) >= 3) status = "unresponsive";
  else if (!anyAvailable) status = "cooling_down";

  return {
    dni,
    totalContactsMade,
    totalResponses,
    responseRate: totalResponses / totalContactsMade,
    channels,
    preferredChannel: inferPreferred(raw),
    healthScore: healthScore(raw, now),
    status,
    nextAvailableAt,
    optOuts: raw.optOuts,
  };
}
