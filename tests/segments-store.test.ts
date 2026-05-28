import { describe, it, expect, beforeEach } from "vitest";
import {
  deleteSegment,
  getSavedSegment,
  listSavedSegments,
  saveSegment,
} from "@/lib/segments-store";

// Asegura aislamiento entre tests (path memoria comparte globalThis).
// Importante: mutar el array existente, no reasignarlo — el lib capturó la
// referencia al cargar.
beforeEach(() => {
  const g = globalThis as unknown as { __segmentos?: unknown[] };
  if (g.__segmentos) g.__segmentos.length = 0;
});

describe("segments-store (memory path)", () => {
  it("saveSegment crea fila con id + createdAt + nombre + filtros", async () => {
    const seg = await saveSegment("Mujeres 40+", { sexo: "F", edadMin: 40 });
    expect(seg.id).toBeTypeOf("string");
    expect(seg.nombre).toBe("Mujeres 40+");
    expect(seg.filtros).toEqual({ sexo: "F", edadMin: 40 });
    expect(seg.created_at).toBeTypeOf("string");
  });

  it("listSavedSegments devuelve por fecha desc", async () => {
    await saveSegment("A", { sexo: "F" });
    await new Promise((r) => setTimeout(r, 5));
    await saveSegment("B", { sexo: "M" });
    const list = await listSavedSegments();
    expect(list.map((s) => s.nombre)).toEqual(["B", "A"]);
  });

  it("getSavedSegment devuelve por id", async () => {
    const seg = await saveSegment("Test", { barrio: "Centro" });
    const found = await getSavedSegment(seg.id);
    expect(found?.nombre).toBe("Test");
  });

  it("getSavedSegment con id desconocido → undefined", async () => {
    expect(await getSavedSegment("no-existe")).toBeUndefined();
  });

  it("deleteSegment remueve", async () => {
    const seg = await saveSegment("Eliminable", {});
    await deleteSegment(seg.id);
    expect(await getSavedSegment(seg.id)).toBeUndefined();
    expect(await listSavedSegments()).toHaveLength(0);
  });

  it("deleteSegment con id inexistente no rompe", async () => {
    await expect(deleteSegment("ghost")).resolves.toBeUndefined();
  });

  it("createdBy se persiste cuando se pasa", async () => {
    const seg = await saveSegment("Mio", {}, "user@example.com");
    expect(seg.created_by).toBe("user@example.com");
  });

  it("createdBy null por default", async () => {
    const seg = await saveSegment("Anon", {});
    expect(seg.created_by).toBeNull();
  });
});
