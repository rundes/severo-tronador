import { describe, it, expect } from "vitest";
import {
  applySegment,
  barriosDisponibles,
  buildFunnel,
  edadDe,
  filterFromParams,
  loadContacts,
  parseManualList,
  type ContactWithRelationship,
} from "@/lib/segments";

const NOW = Date.parse("2026-05-28T00:00:00Z");

function row(
  partial: Partial<ContactWithRelationship["contact"]> & { dni: string },
  health = 100,
): ContactWithRelationship {
  const contact = {
    dni: partial.dni,
    nombre: partial.nombre ?? "X",
    apellido: partial.apellido ?? "Y",
    sexo: partial.sexo,
    barrio: partial.barrio,
    circuito: partial.circuito,
    mesa: partial.mesa,
    fecha_nac: partial.fecha_nac,
    email: partial.email,
    telefono: partial.telefono,
  };
  return {
    contact,
    edad: edadDe(contact.fecha_nac, NOW),
    rel: {
      dni: contact.dni,
      totalContactsMade: 0,
      totalResponses: 0,
      responseRate: 0,
      channels: {},
      preferredChannel: null,
      healthScore: health,
      status: "available",
      nextAvailableAt: null,
      optOuts: [],
    },
  };
}

describe("parseManualList", () => {
  it("clasifica DNIs y emails, normaliza y deduplica", () => {
    const r = parseManualList("30123456, vecino@Mail.com 30123456\n41222333; VECINO@mail.com");
    expect(r.dnis.sort()).toEqual(["30123456", "41222333"]);
    expect(r.emails).toEqual(["vecino@mail.com"]);
  });
});

describe("applySegment · lista manual", () => {
  const all = [
    row({ dni: "30123456", email: "a@x.com" }),
    row({ dni: "41222333", email: "b@x.com" }),
    row({ dni: "99999999", email: "c@x.com" }),
  ];
  it("filtra por DNIs explícitos", () => {
    const m = applySegment(all, { dnis: ["30123456", "41222333"] }, NOW);
    expect(m.map((x) => x.contact.dni).sort()).toEqual(["30123456", "41222333"]);
  });
  it("filtra por emails (case-insensitive) o DNI", () => {
    const m = applySegment(all, { dnis: ["30123456"], emails: ["b@x.com"] }, NOW);
    expect(m.map((x) => x.contact.dni).sort()).toEqual(["30123456", "41222333"]);
  });
});

describe("edadDe", () => {
  it("calcula años correctamente", () => {
    expect(edadDe("1990-01-15", NOW)).toBe(36);
  });
  it("sin fecha → null", () => {
    expect(edadDe(undefined, NOW)).toBeNull();
  });
  it("fecha inválida → null", () => {
    expect(edadDe("garbage", NOW)).toBeNull();
  });
  it("cumple en diciembre y hoy es mayo → no cumplió todavía", () => {
    expect(edadDe("1990-12-31", NOW)).toBe(35);
  });
});

describe("applySegment", () => {
  const all = [
    row({ dni: "1", sexo: "F", barrio: "Centro", fecha_nac: "1990-01-15" }),
    row({ dni: "2", sexo: "M", barrio: "Norte", fecha_nac: "2000-01-01" }),
    row({ dni: "3", sexo: "F", barrio: "Centro", fecha_nac: "1970-01-01" }, 50),
    row({ dni: "4", sexo: "M", barrio: "Sur" }, 30),
  ];

  it("sin filtros → todos", () => {
    expect(applySegment(all, {})).toHaveLength(4);
  });

  it("filtra por sexo", () => {
    const out = applySegment(all, { sexo: "F" });
    expect(out.map((c) => c.contact.dni)).toEqual(["1", "3"]);
  });

  it("filtra por barrio (exacto)", () => {
    const out = applySegment(all, { barrio: "Centro" });
    expect(out.map((c) => c.contact.dni)).toEqual(["1", "3"]);
  });

  it("filtra por edadMin", () => {
    const out = applySegment(all, { edadMin: 40 });
    expect(out.map((c) => c.contact.dni)).toEqual(["3"]);
  });

  it("filtra por edadMax", () => {
    const out = applySegment(all, { edadMax: 30 });
    expect(out.map((c) => c.contact.dni)).toEqual(["2"]);
  });

  it("filtro de edad excluye contactos sin fecha_nac", () => {
    const out = applySegment(all, { edadMin: 0 });
    expect(out.map((c) => c.contact.dni)).toEqual(["1", "2", "3"]);
  });

  it("filtra por healthMin", () => {
    const out = applySegment(all, { healthMin: 80 });
    expect(out.map((c) => c.contact.dni)).toEqual(["1", "2"]);
  });

  it("combina varios filtros con AND", () => {
    const out = applySegment(all, { sexo: "F", barrio: "Centro", healthMin: 80 });
    expect(out.map((c) => c.contact.dni)).toEqual(["1"]);
  });

  it("sin matches → []", () => {
    expect(applySegment(all, { barrio: "Inexistente" })).toEqual([]);
  });
});

describe("applySegment — filtros avanzados (Plan 02 F1.3)", () => {
  function richRow(
    partial: Partial<ContactWithRelationship["contact"]> & { dni: string },
    rel: Partial<ContactWithRelationship["rel"]> = {},
  ): ContactWithRelationship {
    const base = row(partial);
    return { ...base, rel: { ...base.rel, ...rel } };
  }

  it("filtra por circuito y mesa exactos", () => {
    const all = [
      richRow({ dni: "1", circuito: "12", mesa: "0034" }),
      richRow({ dni: "2", circuito: "12", mesa: "0099" }),
      richRow({ dni: "3", circuito: "13", mesa: "0034" }),
    ];
    expect(applySegment(all, { circuito: "12" }).map((c) => c.contact.dni)).toEqual(
      ["1", "2"],
    );
    expect(
      applySegment(all, { circuito: "12", mesa: "0034" }).map((c) => c.contact.dni),
    ).toEqual(["1"]);
  });

  it("filtra por healthBands (multi-select)", () => {
    const all = [
      richRow({ dni: "g" }, { healthScore: 90 }),
      richRow({ dni: "y" }, { healthScore: 60 }),
      richRow({ dni: "r" }, { healthScore: 20 }),
    ];
    expect(
      applySegment(all, { healthBands: ["green", "red"] }).map((c) => c.contact.dni),
    ).toEqual(["g", "r"]);
  });

  it("hasEmail true/false discrimina", () => {
    const all = [
      richRow({ dni: "1", email: "a@x.com" }),
      richRow({ dni: "2" }),
    ];
    expect(applySegment(all, { hasEmail: true }).map((c) => c.contact.dni)).toEqual([
      "1",
    ]);
    expect(applySegment(all, { hasEmail: false }).map((c) => c.contact.dni)).toEqual([
      "2",
    ]);
  });

  it("preferredChannel matchea ficha de relación", () => {
    const all = [
      richRow({ dni: "1" }, { preferredChannel: "email" }),
      richRow({ dni: "2" }, { preferredChannel: "whatsapp" }),
    ];
    expect(
      applySegment(all, { preferredChannel: "whatsapp" }).map((c) => c.contact.dni),
    ).toEqual(["2"]);
  });

  it("respondedWithinDays incluye solo quien respondió dentro de la ventana", () => {
    const NOW = Date.parse("2026-05-28T00:00:00Z");
    const recent = new Date(NOW - 10 * 86400000).toISOString();
    const old = new Date(NOW - 100 * 86400000).toISOString();
    const all = [
      richRow({ dni: "recent" }, {
        channels: { email: { available: true, lastRespondedAt: recent } },
      }),
      richRow({ dni: "old" }, {
        channels: { email: { available: true, lastRespondedAt: old } },
      }),
      richRow({ dni: "never" }, { channels: {} }),
    ];
    const out = applySegment(all, { respondedWithinDays: 30 }, NOW);
    expect(out.map((c) => c.contact.dni)).toEqual(["recent"]);
  });

  it("notContactedDays incluye nunca-contactados + contactados hace tiempo", () => {
    const NOW = Date.parse("2026-05-28T00:00:00Z");
    const recent = new Date(NOW - 10 * 86400000).toISOString();
    const old = new Date(NOW - 100 * 86400000).toISOString();
    const all = [
      richRow({ dni: "recent" }, {
        channels: { email: { available: false, lastContactedAt: recent } },
      }),
      richRow({ dni: "old" }, {
        channels: { email: { available: true, lastContactedAt: old } },
      }),
      richRow({ dni: "never" }, { channels: {} }),
    ];
    const out = applySegment(all, { notContactedDays: 60 }, NOW);
    expect(out.map((c) => c.contact.dni)).toEqual(
      expect.arrayContaining(["old", "never"]),
    );
    expect(out.map((c) => c.contact.dni)).not.toContain("recent");
  });
});

describe("filterFromParams (Plan 02 F1.3)", () => {
  it("parsea healthBands CSV", () => {
    const f = filterFromParams({ healthBands: "green,yellow" });
    expect(f.healthBands).toEqual(["green", "yellow"]);
  });

  it("descarta valores inválidos de healthBands", () => {
    const f = filterFromParams({ healthBands: "green,invalid,red" });
    expect(f.healthBands).toEqual(["green", "red"]);
  });

  it("hasEmail '1' → true, '0' → false, undefined si vacío", () => {
    expect(filterFromParams({ hasEmail: "1" }).hasEmail).toBe(true);
    expect(filterFromParams({ hasEmail: "0" }).hasEmail).toBe(false);
    expect(filterFromParams({ hasEmail: "" }).hasEmail).toBeUndefined();
  });

  it("preferredChannel rechaza valores fuera del enum", () => {
    expect(filterFromParams({ preferredChannel: "fax" }).preferredChannel).toBeUndefined();
    expect(filterFromParams({ preferredChannel: "voice" }).preferredChannel).toBe(
      "voice",
    );
  });
});

describe("filterFromParams", () => {
  it("parsea params del query string", () => {
    const f = filterFromParams({
      sexo: "F",
      edadMin: "30",
      edadMax: "60",
      barrio: "Centro",
      healthMin: "70",
    });
    expect(f).toEqual({
      sexo: "F",
      edadMin: 30,
      edadMax: 60,
      barrio: "Centro",
      healthMin: 70,
    });
  });

  it("descarta valores numéricos inválidos como undefined", () => {
    expect(filterFromParams({ edadMin: "abc", edadMax: "" })).toEqual({
      sexo: undefined,
      edadMin: undefined,
      edadMax: undefined,
      barrio: undefined,
      healthMin: undefined,
    });
  });

  it("sexo distinto de F/M → undefined", () => {
    expect(filterFromParams({ sexo: "X" }).sexo).toBeUndefined();
  });

  it("barrio vacío → undefined (no string vacío)", () => {
    expect(filterFromParams({ barrio: "" }).barrio).toBeUndefined();
  });
});

describe("barriosDisponibles", () => {
  it("devuelve únicos ordenados alfabéticamente", () => {
    const all = [
      row({ dni: "1", barrio: "Norte" }),
      row({ dni: "2", barrio: "Centro" }),
      row({ dni: "3", barrio: "Norte" }),
      row({ dni: "4", barrio: "Acuyo" }),
    ];
    expect(barriosDisponibles(all)).toEqual(["Acuyo", "Centro", "Norte"]);
  });

  it("omite contactos sin barrio", () => {
    const all = [
      row({ dni: "1", barrio: "Centro" }),
      row({ dni: "2" }),
      row({ dni: "3", barrio: undefined }),
    ];
    expect(barriosDisponibles(all)).toEqual(["Centro"]);
  });
});

describe("buildFunnel (Plan 02 F1.4)", () => {
  const all = [
    row({ dni: "1", sexo: "F", barrio: "Centro", fecha_nac: "1990-01-15" }),
    row({ dni: "2", sexo: "M", barrio: "Norte", fecha_nac: "2000-01-01" }),
    row({ dni: "3", sexo: "F", barrio: "Centro", fecha_nac: "1970-01-01" }, 50),
    row({ dni: "4", sexo: "M", barrio: "Sur" }, 30),
  ];

  it("sin filtros → [] vacío", () => {
    expect(buildFunnel(all, {})).toEqual([]);
  });

  it("filtro único → 1 step con delta = caídas", () => {
    const out = buildFunnel(all, { sexo: "F" });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: "sexo", count: 2, delta: 2 });
  });

  it("múltiples filtros se acumulan con delta correcto", () => {
    const out = buildFunnel(all, { sexo: "F", barrio: "Centro" });
    expect(out.map((s) => s.key)).toEqual(["sexo", "barrio"]);
    // sexo=F: 4 → 2 (cae 2). barrio=Centro: 2 → 2 (las dos F son Centro).
    expect(out[0]).toMatchObject({ count: 2, delta: 2 });
    expect(out[1]).toMatchObject({ count: 2, delta: 0 });
  });

  it("ignora arrays vacíos como filtro inactivo", () => {
    expect(buildFunnel(all, { healthBands: [] })).toEqual([]);
  });

  it("label legible por filtro", () => {
    const out = buildFunnel(all, { sexo: "F", barrio: "Centro" });
    expect(out[0].label).toBe("sexo = F");
    expect(out[1].label).toBe("barrio = Centro");
  });
});

describe("loadContacts (memory path)", () => {
  it("devuelve contactos del padron mock con relación derivada y edad", async () => {
    const all = await loadContacts("p1");
    expect(all.length).toBeGreaterThan(0);
    for (const c of all) {
      expect(c.contact.dni).toBeTypeOf("string");
      expect(c.rel.dni).toBe(c.contact.dni);
      expect(c.rel.healthScore).toBeGreaterThanOrEqual(0);
      expect(c.rel.healthScore).toBeLessThanOrEqual(100);
    }
  });
});
