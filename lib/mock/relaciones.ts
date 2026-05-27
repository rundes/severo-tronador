// Historial de relación mock para F2. Genera eventos de contacto
// determinísticos por DNI sobre el padrón mock, para que health score,
// cooldowns y distribución de salud sean demostrables sin envíos reales.
// Se reemplaza por la hoja `envios` cuando empiecen las campañas (F3+).
import { mockPadron } from "./padron";
import type { Channel, RawRelationship, ContactEvent } from "@/lib/relationship";

const CHANNELS: Channel[] = ["email", "whatsapp", "sms", "voice"];
const NOW = Date.UTC(2026, 4, 26); // 2026-05-26, fijo para que el mock sea estable
const DAY_MS = 24 * 60 * 60 * 1000;

function rng(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRaw(dni: string): RawRelationship {
  const seed = Number(dni.slice(-7));
  const rand = rng(seed);

  // ~45% de los contactos no tienen historial todavía.
  if (rand() < 0.45) return { dni, events: [], optOuts: [] };

  const nEvents = 1 + Math.floor(rand() * 4); // 1–4 eventos
  const events: ContactEvent[] = [];
  let daysAgo = 20 + Math.floor(rand() * 300); // primer contacto

  for (let i = 0; i < nEvents; i++) {
    const channel = CHANNELS[Math.floor(rand() * CHANNELS.length)];
    const contactedAt = new Date(NOW - daysAgo * DAY_MS).toISOString();
    const responded = rand() < 0.55;
    const complained = !responded && rand() < 0.08;
    events.push({
      channel,
      contactedAt,
      respondedAt: responded
        ? new Date(NOW - (daysAgo - 1) * DAY_MS).toISOString()
        : undefined,
      complained: complained || undefined,
    });
    daysAgo = Math.max(2, daysAgo - 15 - Math.floor(rand() * 60));
  }

  // ~7% de baja en un canal.
  const optOuts =
    rand() < 0.07
      ? [
          {
            channel: CHANNELS[Math.floor(rand() * CHANNELS.length)],
            at: new Date(NOW - Math.floor(rand() * 100) * DAY_MS).toISOString(),
            reason: "respondió BAJA",
          },
        ]
      : [];

  return { dni, events, optOuts };
}

const rawByDni = new Map<string, RawRelationship>(
  mockPadron.map((c) => [c.dni, buildRaw(c.dni)]),
);

export function getRawRelationship(dni: string): RawRelationship | undefined {
  return rawByDni.get(dni);
}
