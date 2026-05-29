import { describe, it, expect } from "vitest";
import {
  COOLDOWN_DAYS,
  channelAvailable,
  deriveRelationship,
  edadLabel,
  healthBand,
  healthScore,
  type RawRelationship,
  type ContactEvent,
} from "@/lib/relationship";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-05-28T00:00:00Z");

function ev(
  partial: Partial<ContactEvent> & { channel: ContactEvent["channel"] },
): ContactEvent {
  return {
    contactedAt: new Date(NOW - 10 * DAY).toISOString(),
    ...partial,
  };
}

describe("edadLabel", () => {
  it("devuelve la edad correcta cumpliendo años antes de hoy", () => {
    expect(edadLabel("1990-01-15", NOW)).toBe("36 años");
  });

  it("aún no cumplió este año → edad - 1", () => {
    expect(edadLabel("1990-12-31", NOW)).toBe("35 años");
  });

  it("sin fecha → 'edad —'", () => {
    expect(edadLabel(undefined, NOW)).toBe("edad —");
  });

  it("fecha inválida → 'edad —'", () => {
    expect(edadLabel("no-es-fecha", NOW)).toBe("edad —");
  });
});

describe("healthScore", () => {
  it("sin historial → 100", () => {
    expect(healthScore(undefined, NOW)).toBe(100);
  });

  it("eventos vacíos → 100", () => {
    expect(healthScore({ dni: "1", events: [], optOuts: [] }, NOW)).toBe(100);
  });

  it("complained → penaliza fuerte (-50)", () => {
    const raw: RawRelationship = {
      dni: "1",
      events: [ev({ channel: "email", complained: true })],
      optOuts: [],
    };
    const s = healthScore(raw, NOW);
    expect(s).toBeLessThanOrEqual(50);
  });

  it("respondió en últimos 90d → bonus +20 + 30 por ever-responded", () => {
    const raw: RawRelationship = {
      dni: "1",
      events: [
        ev({
          channel: "email",
          respondedAt: new Date(NOW - 5 * DAY).toISOString(),
        }),
      ],
      optOuts: [],
    };
    expect(healthScore(raw, NOW)).toBeGreaterThanOrEqual(90);
  });

  it("3 contactos seguidos sin respuesta → -60", () => {
    const raw: RawRelationship = {
      dni: "1",
      events: [
        ev({ channel: "email" }),
        ev({ channel: "email" }),
        ev({ channel: "email" }),
      ],
      optOuts: [],
    };
    expect(healthScore(raw, NOW)).toBeLessThanOrEqual(40);
  });

  it("clampea en [0, 100]", () => {
    const allBad: RawRelationship = {
      dni: "1",
      events: Array.from({ length: 10 }, () => ev({ channel: "email", complained: true })),
      optOuts: [],
    };
    expect(healthScore(allBad, NOW)).toBe(0);
  });
});

describe("healthBand", () => {
  it("≥80 → green, ≥40 → yellow, <40 → red", () => {
    expect(healthBand(95)).toBe("green");
    expect(healthBand(80)).toBe("green");
    expect(healthBand(79)).toBe("yellow");
    expect(healthBand(40)).toBe("yellow");
    expect(healthBand(39)).toBe("red");
    expect(healthBand(0)).toBe("red");
  });
});

describe("channelAvailable", () => {
  it("sin estado del canal y sin opt-out → true", () => {
    const rel = deriveRelationship("1", undefined, NOW);
    expect(channelAvailable(rel, "email")).toBe(true);
  });

  it("respeta opt-out de canal específico (con al menos 1 evento)", () => {
    // deriveRelationship descarta optOuts si events=[] (early return). Para
    // ejercitar la rama de opt-out de canal, hace falta ≥1 evento en otro canal.
    const raw: RawRelationship = {
      dni: "1",
      events: [ev({ channel: "voice", contactedAt: new Date(NOW - 5 * DAY).toISOString() })],
      optOuts: [{ channel: "email", at: new Date(NOW).toISOString() }],
    };
    const rel = deriveRelationship("1", raw, NOW);
    expect(channelAvailable(rel, "email")).toBe(false);
    expect(channelAvailable(rel, "sms")).toBe(true);
  });
});

describe("deriveRelationship — cooldown", () => {
  it("cooldown completo si NO respondió al último", () => {
    const contactedAt = new Date(NOW - 5 * DAY).toISOString();
    const raw: RawRelationship = {
      dni: "1",
      events: [ev({ channel: "email", contactedAt })],
      optOuts: [],
    };
    const rel = deriveRelationship("1", raw, NOW);
    // email cooldown = 14d. Pasaron 5d → no disponible.
    expect(rel.channels.email?.available).toBe(false);
    const nextAt = +new Date(rel.channels.email!.nextAvailableAt!);
    expect(nextAt - +new Date(contactedAt)).toBeCloseTo(
      COOLDOWN_DAYS.email * DAY,
      -3,
    );
  });

  it("cooldown reducido a la mitad si respondió al último", () => {
    const contactedAt = new Date(NOW - 8 * DAY).toISOString();
    const respondedAt = new Date(NOW - 7 * DAY).toISOString();
    const raw: RawRelationship = {
      dni: "1",
      events: [ev({ channel: "email", contactedAt, respondedAt })],
      optOuts: [],
    };
    const rel = deriveRelationship("1", raw, NOW);
    // cooldown email = 14d → /2 = 7d. Pasaron 8d → disponible.
    expect(rel.channels.email?.available).toBe(true);
  });
});

describe("deriveRelationship — status", () => {
  it("opt-out en todos los canales → opted_out (con ≥1 evento)", () => {
    // El early-return con events=[] devuelve status='available' ignorando
    // optOuts (latente en la lib). Forzamos la rama completa con un evento.
    const raw: RawRelationship = {
      dni: "1",
      events: [
        ev({
          channel: "email",
          respondedAt: new Date(NOW - 30 * DAY).toISOString(),
          contactedAt: new Date(NOW - 30 * DAY).toISOString(),
        }),
      ],
      optOuts: [
        { channel: "email", at: "x" },
        { channel: "whatsapp", at: "x" },
        { channel: "sms", at: "x" },
        { channel: "voice", at: "x" },
        { channel: "telegram", at: "x" },
      ],
    };
    const rel = deriveRelationship("1", raw, NOW);
    expect(rel.status).toBe("opted_out");
  });

  it("3 unanswered seguidos → unresponsive", () => {
    const raw: RawRelationship = {
      dni: "1",
      events: [
        ev({ channel: "email" }),
        ev({ channel: "email" }),
        ev({ channel: "email" }),
      ],
      optOuts: [],
    };
    const rel = deriveRelationship("1", raw, NOW);
    expect(rel.status).toBe("unresponsive");
  });

  it("todos los canales en cooldown pero respondidos → cooling_down", () => {
    // Requisitos: anyAvailable=false (necesita evento en cada uno de los 4
    // canales o canales no tocados quedan available=true por default),
    // consecutiveUnanswered < 3, no opted_out.
    const recent = new Date(NOW - DAY).toISOString();
    const raw: RawRelationship = {
      dni: "1",
      events: [
        ev({ channel: "email", contactedAt: recent, respondedAt: recent }),
        ev({ channel: "whatsapp", contactedAt: recent, respondedAt: recent }),
        ev({ channel: "sms", contactedAt: recent, respondedAt: recent }),
        ev({ channel: "voice", contactedAt: recent, respondedAt: recent }),
        ev({ channel: "telegram", contactedAt: recent, respondedAt: recent }),
      ],
      optOuts: [],
    };
    const rel = deriveRelationship("1", raw, NOW);
    expect(rel.status).toBe("cooling_down");
    expect(rel.nextAvailableAt).not.toBeNull();
  });

  it("sin historial → available + score 100", () => {
    const rel = deriveRelationship("1", undefined, NOW);
    expect(rel.status).toBe("available");
    expect(rel.healthScore).toBe(100);
    expect(rel.nextAvailableAt).toBeNull();
  });
});

describe("deriveRelationship — preferredChannel", () => {
  it("<3 eventos → null", () => {
    const raw: RawRelationship = {
      dni: "1",
      events: [ev({ channel: "email" }), ev({ channel: "sms" })],
      optOuts: [],
    };
    expect(deriveRelationship("1", raw, NOW).preferredChannel).toBeNull();
  });

  it("≥3 eventos, mejor ratio respondidos gana", () => {
    const raw: RawRelationship = {
      dni: "1",
      events: [
        ev({
          channel: "email",
          respondedAt: new Date(NOW - 4 * DAY).toISOString(),
        }),
        ev({ channel: "sms" }),
        ev({ channel: "sms" }),
      ],
      optOuts: [],
    };
    expect(deriveRelationship("1", raw, NOW).preferredChannel).toBe("email");
  });

  it("nadie respondió → null aunque haya eventos", () => {
    const raw: RawRelationship = {
      dni: "1",
      events: [
        ev({ channel: "email" }),
        ev({ channel: "sms" }),
        ev({ channel: "voice" }),
      ],
      optOuts: [],
    };
    expect(deriveRelationship("1", raw, NOW).preferredChannel).toBeNull();
  });
});

describe("deriveRelationship — métricas agregadas", () => {
  it("totalContactsMade, totalResponses, responseRate", () => {
    const raw: RawRelationship = {
      dni: "1",
      events: [
        ev({
          channel: "email",
          respondedAt: new Date(NOW - 5 * DAY).toISOString(),
        }),
        ev({ channel: "email" }),
        ev({
          channel: "sms",
          respondedAt: new Date(NOW - 3 * DAY).toISOString(),
        }),
        ev({ channel: "voice" }),
      ],
      optOuts: [],
    };
    const rel = deriveRelationship("1", raw, NOW);
    expect(rel.totalContactsMade).toBe(4);
    expect(rel.totalResponses).toBe(2);
    expect(rel.responseRate).toBe(0.5);
  });
});
