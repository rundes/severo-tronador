import { describe, it, expect } from "vitest";
import { splitReport } from "@/lib/daily-report";

describe("splitReport", () => {
  it("separa el markdown del bloque json de nuevosActores", () => {
    const text = "# Informe\n\nTexto.\n\n```json\n{\"nuevosActores\":[{\"handle\":\"@LaVozDeIbicuy\",\"platform\":\"facebook\",\"category\":\"medio\",\"direccion\":\"B\",\"evidencia\":\"https://fb/1\",\"razon\":\"publicó 3 críticas\"}]}\n```";
    const { markdown, nuevosActores } = splitReport(text);
    expect(markdown).toBe("# Informe\n\nTexto.");
    expect(nuevosActores).toEqual([
      { handle: "@LaVozDeIbicuy", platform: "facebook", category: "medio", direccion: "B", evidencia: "https://fb/1", razon: "publicó 3 críticas" },
    ]);
  });

  it("sin bloque → markdown completo y []", () => {
    expect(splitReport("# Solo texto")).toEqual({ markdown: "# Solo texto", nuevosActores: [] });
  });

  it("bloque inválido → markdown sin el bloque y []", () => {
    const { markdown, nuevosActores } = splitReport("Texto\n```json\n{ roto\n```");
    expect(markdown).toBe("Texto");
    expect(nuevosActores).toEqual([]);
  });

  it("descarta actores con plataforma/categoría fuera de la taxonomía", () => {
    const text = "T\n```json\n{\"nuevosActores\":[{\"handle\":\"a\",\"platform\":\"threads\",\"category\":\"medio\",\"direccion\":\"?\",\"razon\":\"r\"},{\"handle\":\"b\",\"platform\":\"x\",\"category\":\"opera\",\"direccion\":\"A\",\"razon\":\"r\"}]}\n```";
    expect(splitReport(text).nuevosActores.map((a) => a.handle)).toEqual(["b"]);
  });

  it("toma el último bloque aunque el modelo agregue texto después", () => {
    const text = "Cuerpo\n```json\n{\"nuevosActores\":[]}\n```\nEspero que sirva.";
    const { markdown, nuevosActores } = splitReport(text);
    expect(markdown).toBe("Cuerpo");
    expect(nuevosActores).toEqual([]);
  });

  it("evidencia que no es URL se descarta pero el actor queda", () => {
    const text = "T\n```json\n{\"nuevosActores\":[{\"handle\":\"c\",\"platform\":\"x\",\"category\":\"medio\",\"direccion\":\"A\",\"evidencia\":\"ver captura\",\"razon\":\"r\"}]}\n```";
    const [a] = splitReport(text).nuevosActores;
    expect(a.handle).toBe("c");
    expect(a.evidencia).toBeUndefined();
  });
});
