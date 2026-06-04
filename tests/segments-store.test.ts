import { describe, it, expect, beforeEach } from "vitest";
import {
  deleteSegment,
  getSavedSegment,
  listSavedSegments,
  saveSegment,
} from "@/lib/segments-store";

const P = "proj-1";
const P2 = "proj-2";

// Asegura aislamiento entre tests (path memoria comparte globalThis).
// Importante: mutar el array existente, no reasignarlo — el lib capturó la
// referencia al cargar.
beforeEach(() => {
  const g = globalThis as unknown as { __segmentos?: unknown[] };
  if (g.__segmentos) g.__segmentos.length = 0;
});

describe("segments-store (memory path, por proyecto)", () => {
  it("saveSegment crea fila con id + createdAt + nombre + filtros + project_id", async () => {
    const seg = await saveSegment(P, "Mujeres 40+", { sexo: "F", edadMin: 40 });
    expect(seg.id).toBeTypeOf("string");
    expect(seg.project_id).toBe(P);
    expect(seg.nombre).toBe("Mujeres 40+");
    expect(seg.filtros).toEqual({ sexo: "F", edadMin: 40 });
    expect(seg.created_at).toBeTypeOf("string");
  });

  it("listSavedSegments devuelve por fecha desc", async () => {
    await saveSegment(P, "A", { sexo: "F" });
    await new Promise((r) => setTimeout(r, 5));
    await saveSegment(P, "B", { sexo: "M" });
    const list = await listSavedSegments(P);
    expect(list.map((s) => s.nombre)).toEqual(["B", "A"]);
  });

  it("getSavedSegment devuelve por id dentro del proyecto", async () => {
    const seg = await saveSegment(P, "Test", { barrio: "Centro" });
    const found = await getSavedSegment(P, seg.id);
    expect(found?.nombre).toBe("Test");
  });

  it("getSavedSegment con id desconocido → undefined", async () => {
    expect(await getSavedSegment(P, "no-existe")).toBeUndefined();
  });

  it("deleteSegment remueve", async () => {
    const seg = await saveSegment(P, "Eliminable", {});
    await deleteSegment(P, seg.id);
    expect(await getSavedSegment(P, seg.id)).toBeUndefined();
    expect(await listSavedSegments(P)).toHaveLength(0);
  });

  it("deleteSegment con id inexistente no rompe", async () => {
    await expect(deleteSegment(P, "ghost")).resolves.toBeUndefined();
  });

  it("createdBy se persiste cuando se pasa", async () => {
    const seg = await saveSegment(P, "Mio", {}, "user@example.com");
    expect(seg.created_by).toBe("user@example.com");
  });

  it("createdBy null por default", async () => {
    const seg = await saveSegment(P, "Anon", {});
    expect(seg.created_by).toBeNull();
  });

  it("aislamiento: un segmento de un proyecto no aparece en otro", async () => {
    const a = await saveSegment(P, "De P", {});
    await saveSegment(P2, "De P2", {});
    expect((await listSavedSegments(P)).map((s) => s.nombre)).toEqual(["De P"]);
    // get/delete cross-proyecto no resuelven la fila de otro proyecto
    expect(await getSavedSegment(P2, a.id)).toBeUndefined();
    await deleteSegment(P2, a.id);
    expect(await getSavedSegment(P, a.id)).toBeTruthy();
  });
});
