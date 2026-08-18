// Orden de columnas del espejo a Sheets (F3.6 del plan de mejoras).
//
// La fila se armaba con Object.values(payload): el orden de inserción de las
// claves. Agregar un campo al modelo desplazaba todas las columnas de ahí en
// adelante y el histórico ya escrito quedaba desalineado contra las filas
// nuevas — en un Sheet que existe justamente para preservar.
import { describe, it, expect } from "vitest";
import { rowFor } from "@/lib/sheets-export";

describe("rowFor · orden explícito de columnas", () => {
  it("respeta el orden declarado, no el de las claves del payload", () => {
    // Mismo contenido, claves en orden distinto → misma fila.
    const a = rowFor("envios", {
      project_id: "p1",
      campaign_id: "c1",
      dni: "1",
      estado: "sent",
    }, "m1");
    const b = rowFor("envios", {
      estado: "sent",
      dni: "1",
      campaign_id: "c1",
      project_id: "p1",
    }, "m1");
    expect(a).toEqual(b);
    expect(a[0]).toBe("m1");
    expect(a[1]).toBe("p1");
    expect(a[2]).toBe("c1");
    expect(a[3]).toBe("1");
  });

  it("un campo nuevo no desplaza las columnas existentes", () => {
    const base = rowFor("envios", { project_id: "p1", dni: "1" }, "m1");
    const conExtra = rowFor(
      "envios",
      { campo_nuevo: "x", project_id: "p1", dni: "1" },
      "m1",
    );
    expect(conExtra).toEqual(base);
  });

  it("los campos ausentes quedan vacíos, no corren el resto", () => {
    const row = rowFor("envios", { project_id: "p1", created_at: "2026-01-01" }, "m1");
    expect(row[0]).toBe("m1");
    expect(row[1]).toBe("p1");
    expect(row[2]).toBe(""); // campaign_id ausente
    expect(row[row.length - 1]).toBe("2026-01-01");
  });

  it("serializa objetos y nulls de forma estable", () => {
    const row = rowFor("campanas", {
      id: "c1",
      metrics: { sent: 2, failed: 0 },
      encuesta_id: null,
    }, "m1");
    expect(row).toContain(JSON.stringify({ sent: 2, failed: 0 }));
    expect(row).toContain("");
  });

  it("una entidad sin columnas declaradas cae al orden de las claves", () => {
    // Mejor espejar algo que perder el dato.
    const row = rowFor("padron", { dni: "1", nombre: "Ana" }, "m1");
    expect(row).toEqual(["m1", "1", "Ana"]);
  });
});

describe("rowFor · tombstones de la hoja bajas", () => {
  // Los op=remove del espejo se registran como tombstone en la hoja `bajas`
  // (el Sheet es un log append-only: no se borran filas, se anota la baja).
  it("arma la fila con _mirror_id, entity, entity_id y removed_at en orden", () => {
    const row = rowFor(
      "bajas",
      { entity: "segmentos", entity_id: "s1", removed_at: "2026-08-18T00:00:00Z" },
      "m9",
    );
    expect(row).toEqual(["m9", "segmentos", "s1", "2026-08-18T00:00:00Z"]);
  });

  it("los campos ausentes quedan vacíos sin correr el resto", () => {
    const row = rowFor("bajas", { entity: "templates", entity_id: "t1" }, "m2");
    expect(row).toEqual(["m2", "templates", "t1", ""]);
  });
});
