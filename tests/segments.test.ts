import { describe, it, expect } from "vitest";
import {
  applySegment,
  barriosDisponibles,
  edadDe,
  filterFromParams,
  loadContacts,
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

describe("loadContacts (memory path)", () => {
  it("devuelve contactos del padron mock con relación derivada y edad", async () => {
    const all = await loadContacts();
    expect(all.length).toBeGreaterThan(0);
    for (const c of all) {
      expect(c.contact.dni).toBeTypeOf("string");
      expect(c.rel.dni).toBe(c.contact.dni);
      expect(c.rel.healthScore).toBeGreaterThanOrEqual(0);
      expect(c.rel.healthScore).toBeLessThanOrEqual(100);
    }
  });
});
