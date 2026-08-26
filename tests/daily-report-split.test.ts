import { describe, it, expect } from "vitest";
import { splitReport, countdownItems, countdownBlock, withCountdown, missingSections } from "@/lib/daily-report";

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
    expect(splitReport("# Solo texto")).toEqual({ markdown: "# Solo texto", nuevosActores: [], briefUpdates: [] });
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

describe("splitReport · briefUpdates", () => {
  it("extrae las propuestas de actualización del brief", () => {
    const text = "# Tesis\n\n```json\n{\"nuevosActores\":[],\"briefUpdates\":[{\"seccion\":\"3.5\",\"texto\":\"Cuenta nueva @identidadverdolaga (1.2k)\"},{\"seccion\":\"7\",\"texto\":\"Pontevedra es el predio de Merlo\"}]}\n```";
    const { markdown, briefUpdates } = splitReport(text);
    expect(markdown).toBe("# Tesis");
    expect(briefUpdates).toEqual([
      { seccion: "3.5", texto: "Cuenta nueva @identidadverdolaga (1.2k)" },
      { seccion: "7", texto: "Pontevedra es el predio de Merlo" },
    ]);
  });

  it("propuestas inválidas se descartan y el informe se guarda igual", () => {
    const text = "T\n```json\n{\"briefUpdates\":[{\"seccion\":\"\",\"texto\":\"x\"},{\"texto\":\"sin seccion\"},{\"seccion\":\"9\",\"texto\":\"vale\"}]}\n```";
    expect(splitReport(text).briefUpdates).toEqual([{ seccion: "9", texto: "vale" }]);
  });

  it("sin bloque json → briefUpdates vacío", () => {
    expect(splitReport("# Solo texto").briefUpdates).toEqual([]);
  });

  it("corta en 8 propuestas", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ seccion: "7", texto: `r${i}` }));
    const text = `T\n\`\`\`json\n${JSON.stringify({ briefUpdates: many })}\n\`\`\``;
    expect(splitReport(text).briefUpdates).toHaveLength(8);
  });
});

describe("countdown", () => {
  const NOW = Date.UTC(2026, 7, 26, 12);
  const calendar = [
    { label: "Elección de comisión", date: "2026-10-05" },
    { label: "Asamblea de socios", date: "2026-09-07" },
    { label: "Cierre de listas | ya pasó", date: "2026-08-01" },
    { label: "Sin fecha", date: "no es fecha" },
  ];

  it("countdownItems ordena por días, filtra pasados e inválidos y limpia pipes", () => {
    expect(countdownItems(calendar, NOW)).toEqual([
      { days: 12, label: "Asamblea de socios", detail: "2 semanas" },
      { days: 40, label: "Elección de comisión", detail: "6 semanas" },
    ]);
  });

  it("countdownBlock arma el bloque cercado que entiende el parser", () => {
    expect(countdownBlock(calendar, NOW)).toBe(
      "```countdown\n12 | Asamblea de socios | 2 semanas\n40 | Elección de comisión | 6 semanas\n```",
    );
  });

  it("sin hitos futuros no hay bloque", () => {
    expect(countdownBlock([{ label: "viejo", date: "2020-01-01" }], NOW)).toBe("");
    expect(countdownBlock([], NOW)).toBe("");
  });

  it("withCountdown inserta después del heading 01", () => {
    const md = "# Tesis\n\nBajada.\n\n## 01 El escenario\n\nNarrativa.";
    expect(withCountdown(md, "```countdown\n3 | X | esta semana\n```")).toBe(
      "# Tesis\n\nBajada.\n\n## 01 El escenario\n\n```countdown\n3 | X | esta semana\n```\n\nNarrativa.",
    );
  });

  it("withCountdown sin heading 01 lo pone arriba de todo; bloque vacío no toca nada", () => {
    expect(withCountdown("# Tesis\n\nBajada.", "```countdown\n3 | X | hoy\n```")).toBe(
      "```countdown\n3 | X | hoy\n```\n\n# Tesis\n\nBajada.",
    );
    expect(withCountdown("# Tesis", "")).toBe("# Tesis");
  });
});

describe("missingSections", () => {
  it("lista las secciones fijas que el modelo no escribió", () => {
    const md = ["# T", "## 01 El escenario", "## 02 Lo que cambió", "## 10 Vigilancia", "## Fuentes"].join("\n\n");
    expect(missingSections(md)).toEqual(["03", "04", "05", "06", "07", "08", "09"]);
  });

  it("informe completo → sin faltantes", () => {
    const md = ["# T", ...["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"].map((n) => `## ${n} Sección`), "## Fuentes"].join("\n\n");
    expect(missingSections(md)).toEqual([]);
  });

  it("sin Fuentes la reporta", () => {
    const md = ["# T", ...["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"].map((n) => `## ${n} S`)].join("\n\n");
    expect(missingSections(md)).toEqual(["Fuentes"]);
  });
});
