import { describe, it, expect } from "vitest";
import {
  applyQuery,
  decodeQuery,
  encodeQuery,
  evalCondition,
  evalGroup,
  filterToQuery,
  isSegmentQuery,
  type SegmentCondition,
  type SegmentGroup,
} from "@/lib/segment-query";
import type { ContactWithRelationship } from "@/lib/segments";
import { applySegment } from "@/lib/segments";

function row(
  overrides: Partial<ContactWithRelationship["contact"]> & { dni: string },
  rel: Partial<ContactWithRelationship["rel"]> = {},
): ContactWithRelationship {
  const contact = {
    dni: overrides.dni,
    nombre: overrides.nombre ?? "X",
    apellido: overrides.apellido ?? "Y",
    sexo: overrides.sexo,
    barrio: overrides.barrio,
    circuito: overrides.circuito,
    mesa: overrides.mesa,
    fecha_nac: overrides.fecha_nac,
    email: overrides.email,
    telefono: overrides.telefono,
  };
  return {
    contact,
    edad: rel.responseRate != null ? rel.responseRate : null,
    rel: {
      dni: contact.dni,
      totalContactsMade: 0,
      totalResponses: 0,
      responseRate: 0,
      channels: {},
      preferredChannel: null,
      healthScore: 100,
      status: "available",
      nextAvailableAt: null,
      optOuts: [],
      ...rel,
    },
  };
}

describe("isSegmentQuery", () => {
  it("reconoce shape group", () => {
    expect(
      isSegmentQuery({ type: "group", combinator: "AND", conditions: [] }),
    ).toBe(true);
  });
  it("rechaza objetos viejos (SegmentFilter)", () => {
    expect(isSegmentQuery({ sexo: "F", edadMin: 40 })).toBe(false);
  });
  it("rechaza null/undefined", () => {
    expect(isSegmentQuery(null)).toBe(false);
    expect(isSegmentQuery(undefined)).toBe(false);
  });
});

describe("evalCondition", () => {
  const ana = row({ dni: "1", sexo: "F", barrio: "Centro" });
  // Forzamos edad manualmente porque row() la deriva de fecha_nac.
  ana.edad = 45;
  ana.rel.healthScore = 85;

  it("eq matchea", () => {
    expect(
      evalCondition({ type: "condition", field: "sexo", op: "eq", value: "F" }, ana),
    ).toBe(true);
    expect(
      evalCondition({ type: "condition", field: "sexo", op: "eq", value: "M" }, ana),
    ).toBe(false);
  });

  it("neq invierte", () => {
    expect(
      evalCondition({ type: "condition", field: "sexo", op: "neq", value: "M" }, ana),
    ).toBe(true);
  });

  it("gte / lte con números", () => {
    expect(
      evalCondition({ type: "condition", field: "edad", op: "gte", value: 40 }, ana),
    ).toBe(true);
    expect(
      evalCondition({ type: "condition", field: "edad", op: "lte", value: 50 }, ana),
    ).toBe(true);
    expect(
      evalCondition({ type: "condition", field: "edad", op: "gte", value: 60 }, ana),
    ).toBe(false);
  });

  it("in / nin con arrays", () => {
    expect(
      evalCondition(
        { type: "condition", field: "healthBand", op: "in", value: ["green", "yellow"] },
        ana,
      ),
    ).toBe(true);
    expect(
      evalCondition(
        { type: "condition", field: "healthBand", op: "nin", value: ["red"] },
        ana,
      ),
    ).toBe(true);
  });

  it("exists / not_exists sobre hasEmail derivado", () => {
    const conEmail = row({ dni: "2", email: "a@x.com" });
    const sinEmail = row({ dni: "3" });
    expect(
      evalCondition(
        { type: "condition", field: "hasEmail", op: "exists", value: null },
        conEmail,
      ),
    ).toBe(true);
    expect(
      evalCondition(
        { type: "condition", field: "hasEmail", op: "not_exists", value: null },
        sinEmail,
      ),
    ).toBe(true);
  });
});

describe("evalGroup AND / OR / NOT", () => {
  const ana = row({ dni: "1", sexo: "F" });
  ana.edad = 45;
  const eq = (f: "sexo" | "edad", v: string | number): SegmentCondition => ({
    type: "condition",
    field: f,
    op: "eq",
    value: v,
  });

  it("AND con todas verdaderas → true", () => {
    const g: SegmentGroup = {
      type: "group",
      combinator: "AND",
      conditions: [eq("sexo", "F"), eq("edad", 45)],
    };
    expect(evalGroup(g, ana)).toBe(true);
  });

  it("AND con una falsa → false", () => {
    const g: SegmentGroup = {
      type: "group",
      combinator: "AND",
      conditions: [eq("sexo", "F"), eq("edad", 99)],
    };
    expect(evalGroup(g, ana)).toBe(false);
  });

  it("OR con al menos una verdadera → true", () => {
    const g: SegmentGroup = {
      type: "group",
      combinator: "OR",
      conditions: [eq("sexo", "M"), eq("edad", 45)],
    };
    expect(evalGroup(g, ana)).toBe(true);
  });

  it("OR con todas falsas → false", () => {
    const g: SegmentGroup = {
      type: "group",
      combinator: "OR",
      conditions: [eq("sexo", "M"), eq("edad", 99)],
    };
    expect(evalGroup(g, ana)).toBe(false);
  });

  it("negate invierte resultado", () => {
    const g: SegmentGroup = {
      type: "group",
      combinator: "AND",
      negate: true,
      conditions: [eq("sexo", "M")],
    };
    expect(evalGroup(g, ana)).toBe(true);
  });

  it("grupo vacío sin negate → true (identidad)", () => {
    const g: SegmentGroup = { type: "group", combinator: "AND", conditions: [] };
    expect(evalGroup(g, ana)).toBe(true);
  });
});

describe("grupos anidados", () => {
  // ( sexo=F AND edad>=40 ) OR ( barrio=Sur AND NOT( edad>=60 ) )
  const query: SegmentGroup = {
    type: "group",
    combinator: "OR",
    conditions: [
      {
        type: "group",
        combinator: "AND",
        conditions: [
          { type: "condition", field: "sexo", op: "eq", value: "F" },
          { type: "condition", field: "edad", op: "gte", value: 40 },
        ],
      },
      {
        type: "group",
        combinator: "AND",
        conditions: [
          { type: "condition", field: "barrio", op: "eq", value: "Sur" },
          {
            type: "group",
            combinator: "AND",
            negate: true,
            conditions: [
              { type: "condition", field: "edad", op: "gte", value: 60 },
            ],
          },
        ],
      },
    ],
  };

  it("rama izquierda matchea", () => {
    const c = row({ dni: "1", sexo: "F" });
    c.edad = 50;
    expect(evalGroup(query, c)).toBe(true);
  });

  it("rama derecha matchea", () => {
    const c = row({ dni: "2", sexo: "M", barrio: "Sur" });
    c.edad = 35;
    expect(evalGroup(query, c)).toBe(true);
  });

  it("rama derecha rechaza por NOT (edad alta)", () => {
    const c = row({ dni: "3", sexo: "M", barrio: "Sur" });
    c.edad = 70;
    expect(evalGroup(query, c)).toBe(false);
  });

  it("nada matchea → false", () => {
    const c = row({ dni: "4", sexo: "M", barrio: "Norte" });
    c.edad = 25;
    expect(evalGroup(query, c)).toBe(false);
  });
});

describe("filterToQuery equivalencia con applySegment", () => {
  const all = [
    rowFull("1", { sexo: "F", barrio: "Centro" }, 45, 85),
    rowFull("2", { sexo: "M", barrio: "Norte" }, 25, 60),
    rowFull("3", { sexo: "F", barrio: "Centro" }, 65, 30),
    rowFull("4", { sexo: "F", barrio: "Sur" }, 50, 90),
  ];

  function rowFull(
    dni: string,
    overrides: Partial<ContactWithRelationship["contact"]>,
    edad: number,
    healthScore: number,
  ): ContactWithRelationship {
    const c = row({ dni, ...overrides });
    c.edad = edad;
    c.rel.healthScore = healthScore;
    return c;
  }

  it("filtro vacío equivale a query vacío AND", () => {
    const fromFlat = applySegment(all, {});
    const fromTree = applyQuery(all, filterToQuery({}));
    expect(fromTree.map((c) => c.contact.dni)).toEqual(
      fromFlat.map((c) => c.contact.dni),
    );
  });

  it("varios filtros AND match exacto", () => {
    const f = { sexo: "F" as const, edadMin: 40, healthMin: 80 };
    expect(applyQuery(all, filterToQuery(f)).map((c) => c.contact.dni)).toEqual(
      applySegment(all, f).map((c) => c.contact.dni),
    );
  });

  it("healthBands → in", () => {
    const f = { healthBands: ["green" as const] };
    expect(applyQuery(all, filterToQuery(f)).map((c) => c.contact.dni)).toEqual(
      applySegment(all, f).map((c) => c.contact.dni),
    );
  });
});

describe("applyQuery", () => {
  it("filtra una lista con un SegmentQuery", () => {
    const all = [
      row({ dni: "1", sexo: "F" }),
      row({ dni: "2", sexo: "M" }),
      row({ dni: "3", sexo: "F" }),
    ];
    const q: SegmentGroup = {
      type: "group",
      combinator: "AND",
      conditions: [{ type: "condition", field: "sexo", op: "eq", value: "F" }],
    };
    expect(applyQuery(all, q).map((c) => c.contact.dni)).toEqual(["1", "3"]);
  });
});

describe("encode/decode URL-safe", () => {
  const q: SegmentGroup = {
    type: "group",
    combinator: "OR",
    conditions: [
      { type: "condition", field: "sexo", op: "eq", value: "F" },
      { type: "condition", field: "edad", op: "gte", value: 65 },
    ],
  };

  it("roundtrip preserva la estructura", () => {
    const encoded = encodeQuery(q);
    const decoded = decodeQuery(encoded);
    expect(decoded).toEqual(q);
  });

  it("base64 URL-safe (sin +/=)", () => {
    const encoded = encodeQuery(q);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("decode con basura devuelve null", () => {
    expect(decodeQuery("garbage!!!")).toBeNull();
  });

  it("decode con JSON válido pero shape incorrecto → null", () => {
    const bad = Buffer.from('{"foo": 1}', "utf8").toString("base64");
    expect(decodeQuery(bad)).toBeNull();
  });
});
