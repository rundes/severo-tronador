import { describe, it, expect, vi, afterEach } from "vitest";
import { generateText } from "@/lib/anthropic";
import { splitReport, countdownItems, countdownBlock, withCountdown, missingSections, reportSections } from "@/lib/daily-report";

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

  it("respuesta truncada: el bloque json sin cerrar no queda en el markdown", () => {
    const text = '# Tesis\n\n## 10 Vigilancia\n\nTexto.\n\n```json\n{"nuevosActores":[{"handle":"@a","platf';
    const { markdown, nuevosActores, briefUpdates } = splitReport(text);
    expect(markdown).toBe("# Tesis\n\n## 10 Vigilancia\n\nTexto.");
    expect(nuevosActores).toEqual([]);
    expect(briefUpdates).toEqual([]);
  });

  it("un ```json cerrado más un ```json abierto: gana el cerrado", () => {
    const text = 'Cuerpo\n```json\n{"nuevosActores":[]}\n```\n\n```json\n{"brief';
    expect(splitReport(text).markdown).toBe("Cuerpo");
  });
});

describe("splitReport · notaOperativa", () => {
  it("extrae la nota operativa del bloque interno", () => {
    const text = '# Tesis\n\nCuerpo.\n\n```json\n{"nuevosActores":[],"briefUpdates":[],"notaOperativa":"Las 3 cuentas del plan figuran con 0 seguidores: revisar el conector."}\n```';
    const { markdown, notaOperativa } = splitReport(text);
    expect(markdown).toBe("# Tesis\n\nCuerpo.");
    expect(notaOperativa).toBe("Las 3 cuentas del plan figuran con 0 seguidores: revisar el conector.");
  });

  it("nota ausente, vacía o de otro tipo → undefined", () => {
    expect(splitReport('T\n```json\n{"nuevosActores":[]}\n```').notaOperativa).toBeUndefined();
    expect(splitReport('T\n```json\n{"notaOperativa":"   "}\n```').notaOperativa).toBeUndefined();
    expect(splitReport('T\n```json\n{"notaOperativa":42}\n```').notaOperativa).toBeUndefined();
    expect(splitReport("# Solo texto").notaOperativa).toBeUndefined();
  });

  it("recorta la nota a 600 caracteres", () => {
    const text = `T\n\`\`\`json\n${JSON.stringify({ notaOperativa: "x".repeat(900) })}\n\`\`\``;
    expect(splitReport(text).notaOperativa).toHaveLength(600);
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

  it("cuenta días de calendario en hora argentina, no en UTC", () => {
    // 2026-08-27T01:00Z todavía es el 26 de agosto en Buenos Aires (UTC-3).
    const madrugada = Date.parse("2026-08-27T01:00:00Z");
    expect(countdownItems([{ label: "Asamblea", date: "2026-08-27" }], madrugada)).toEqual([
      { days: 1, label: "Asamblea", detail: "mañana" },
    ]);
    expect(countdownItems([{ label: "Cierre de listas", date: "2026-08-26" }], madrugada)).toEqual([
      { days: 0, label: "Cierre de listas", detail: "hoy" },
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

  it("withCountdown descarta el countdown que escribió el modelo: queda uno solo, el nuestro", () => {
    const md = [
      "# Tesis",
      "",
      "## 01 El escenario",
      "",
      "```countdown",
      "9 | Inventado por el modelo | esta semana",
      "```",
      "",
      "Narrativa.",
      "",
      "## 02 Lo que cambió",
      "",
      "```countdown",
      "30 | Otro inventado | un mes",
      "```",
    ].join("\n");
    const out = withCountdown(md, "```countdown\n3 | X | esta semana\n```");
    expect(out.match(/```countdown/g)).toHaveLength(1);
    expect(out).toContain("3 | X | esta semana");
    expect(out).not.toContain("Inventado por el modelo");
    expect(out).not.toContain("Otro inventado");
    expect(out.indexOf("```countdown")).toBeGreaterThan(out.indexOf("## 01 El escenario"));
    expect(out).toContain("Narrativa.");
  });

  it("sin bloque propio, el countdown del modelo igual se descarta", () => {
    const md = "# Tesis\n\n## 01 El escenario\n\n```countdown\n9 | Inventado | ya\n```\n\nNarrativa.";
    const out = withCountdown(md, "");
    expect(out).not.toContain("```countdown");
    expect(out).toContain("Narrativa.");
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

  it("Fuentes con título largo cuenta como presente", () => {
    const md = ["# T", ...["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"].map((n) => `## ${n} S`), "## Fuentes citadas"].join("\n\n");
    expect(missingSections(md)).toEqual([]);
  });

  it("proyecto sin escenario electoral: solo pide la estructura reducida", () => {
    const md = ["# T", "## 01 El escenario", "## 02 Lo que cambió", "## Fuentes"].join("\n\n");
    expect(missingSections(md, false)).toEqual(["03", "04", "05", "06"]);
    const completo = ["# T", ...["01", "02", "03", "04", "05", "06"].map((n) => `## ${n} S`), "## Fuentes"].join("\n\n");
    expect(missingSections(completo, false)).toEqual([]);
  });
});

describe("reportSections", () => {
  it("la estructura electoral tiene las 10 secciones + Fuentes", () => {
    expect(reportSections(true).map((s) => s.heading)).toEqual([
      "01 El escenario",
      "02 Lo que cambió",
      "03 Línea de tiempo",
      "04 Contenido efímero",
      "05 Top 5 de discusiones",
      "06 Tono y densidad por agrupación",
      "07 Mapa por categorías",
      "08 Cuentas nuevas y cuentas que operan",
      "09 Normativo y calendario",
      "10 Vigilancia",
      "Fuentes",
    ]);
  });

  it("la estructura reducida renumera y deja 6 secciones + Fuentes", () => {
    expect(reportSections(false).map((s) => s.heading)).toEqual([
      "01 El escenario",
      "02 Lo que cambió",
      "03 Línea de tiempo",
      "04 Top 5 de discusiones",
      "05 Vigilancia",
      "06 Sugerencia operativa",
      "Fuentes",
    ]);
    expect(reportSections(false).every((s) => s.guide.length > 0)).toBe(true);
  });
});

// La truncación por max_tokens es la causa habitual de un informe sin
// Fuentes y con el json a medias: el cliente la tiene que hacer visible.
describe("generateText · stopReason", () => {
  afterEach(() => vi.unstubAllGlobals());

  const respond = (body: unknown) =>
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => body })));

  it("expone el stop_reason de la API", async () => {
    respond({ content: [{ type: "text", text: "hola" }], usage: { input_tokens: 3, output_tokens: 5 }, stop_reason: "max_tokens" });
    const r = await generateText({ apiKey: "k", prompt: "p" });
    expect(r).toEqual({ text: "hola", inputTokens: 3, outputTokens: 5, stopReason: "max_tokens" });
  });

  it("sin stop_reason el resultado sigue siendo válido", async () => {
    respond({ content: [{ type: "text", text: "ok" }] });
    const r = await generateText({ apiKey: "k", prompt: "p" });
    expect(r.text).toBe("ok");
    expect(r.stopReason).toBeUndefined();
  });
});
