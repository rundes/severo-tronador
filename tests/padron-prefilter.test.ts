// Prefiltro del padrón a SQL (F3.1 del plan de mejoras).
//
// loadContacts traía el padrón ENTERO a memoria y derivaba la ficha de relación
// de cada contacto para después descartar en JS a la mayoría. El prefiltro
// empuja a la DB lo que se puede resolver como columna. Es una optimización, no
// un filtro: el filtro completo se sigue aplicando después, así que pasarlo o
// no tiene que dar exactamente el mismo resultado.
import { describe, it, expect } from "vitest";
import { hasPadronPrefilter } from "@/lib/db/padron";
import { padronPrefilterFor } from "@/lib/segments";

describe("padronPrefilterFor", () => {
  it("traduce los predicados que son columna", () => {
    const pf = padronPrefilterFor({
      sexo: "F",
      barrio: "Centro",
      grupoId: "g1",
      hasEmail: true,
    });
    expect(pf).toMatchObject({
      sexo: "F",
      barrio: "Centro",
      grupoId: "g1",
      hasEmail: true,
    });
  });

  it("deja fuera lo que depende de la ficha de relación o de la edad", () => {
    // healthMin, actividad y canal preferido salen de envios/respuestas, no de
    // padron; la edad se calcula sobre fecha_nac, que es text.
    const pf = padronPrefilterFor({
      healthMin: 80,
      respondedWithinDays: 7,
      notContactedDays: 30,
      preferredChannel: "email",
      edadMin: 18,
      edadMax: 65,
      healthBands: ["green"],
    });
    expect(hasPadronPrefilter(pf)).toBe(false);
  });

  it("no empuja la lista de DNIs si el segmento también matchea por email", () => {
    // Un contacto puede entrar por su email sin estar en `dnis`: filtrar por
    // dni en SQL lo dejaría afuera antes de poder evaluarlo.
    const pf = padronPrefilterFor({
      dnis: ["1", "2"],
      emails: ["ana@x.com"],
    });
    expect(pf.dnis).toBeUndefined();
    expect(hasPadronPrefilter(pf)).toBe(false);
  });

  it("empuja la lista de DNIs cuando es el criterio único", () => {
    const pf = padronPrefilterFor({ dnis: ["1", "2"] });
    expect(pf.dnis).toEqual(["1", "2"]);
    expect(hasPadronPrefilter(pf)).toBe(true);
  });

  it("una lista muy larga se filtra en memoria (URL de 414)", () => {
    const dnis = Array.from({ length: 5000 }, (_, i) => String(i));
    expect(hasPadronPrefilter(padronPrefilterFor({ dnis }))).toBe(false);
  });

  it("un filtro vacío no dispara la query especial", () => {
    expect(hasPadronPrefilter(padronPrefilterFor({}))).toBe(false);
    expect(hasPadronPrefilter(undefined)).toBe(false);
  });

  it("hasEmail:false también cuenta como predicado", () => {
    expect(hasPadronPrefilter(padronPrefilterFor({ hasEmail: false }))).toBe(true);
  });
});
