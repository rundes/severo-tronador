import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Los mocks van tipados con la firma real: si se declaran con `vi.fn(async
// () => {})`, `mock.calls[0]` es la tupla vacía y el cast a
// [string, DailyReport] de las aserciones no compila.
type SaveArgs = [string, import("@/lib/daily-report").DailyReport];
const saveReport = vi.fn<(...a: SaveArgs) => Promise<void>>();
const emailDailyReport = vi.fn<(...a: SaveArgs) => Promise<{ sent: number }>>();
vi.mock("@/lib/daily-report", async (orig) => ({
  ...(await orig<typeof import("@/lib/daily-report")>()),
  saveReport: (...a: unknown[]) => saveReport(...(a as SaveArgs)),
  emailDailyReport: (...a: unknown[]) => emailDailyReport(...(a as SaveArgs)),
}));

const items = { 1: 12, 7: 40 } as Record<number, number>;
vi.mock("@/lib/listening-cache", () => ({
  readCachedItems: async (_p: string, days: number) =>
    Array.from({ length: items[days] ?? 0 }, () => ({ source: "x", text: "t" })),
}));

let monitor = { accounts: [], searchesA: [], searchesB: [], calendar: [] as { label: string; date: string }[], noRepetir: [], budget: {}, entidades: {} };
vi.mock("@/lib/monitor-config", async (orig) => ({
  ...(await orig<typeof import("@/lib/monitor-config")>()),
  getMonitorConfig: async () => monitor,
}));

let brief: import("@/lib/client-brief").ClientBrief = { entries: [], pendingUpdates: [], suggestions: [] };
const saveClientBrief = vi.fn(async (_p: string, b: import("@/lib/client-brief").ClientBrief) => { brief = b; });
vi.mock("@/lib/client-brief", async (orig) => ({
  ...(await orig<typeof import("@/lib/client-brief")>()),
  getClientBrief: async () => brief,
  saveClientBrief: (p: string, b: typeof brief) => saveClientBrief(p, b),
}));

import { htmlToMarkdown, importReport, MAX_IMPORT_CHARS, MAX_STORED_CHARS } from "@/lib/report-import";
import { parseReportMarkdown, sectionsOf, type Block } from "@/lib/report-markdown";

const FIXTURE = readFileSync(resolve(__dirname, "fixtures/informe-ferro.html"), "utf8");

describe("htmlToMarkdown · informe de referencia", () => {
  const md = htmlToMarkdown(FIXTURE);

  it("conserva el h1 y la bajada como primer párrafo después del h1", () => {
    expect(md).toContain("# Apareció la primera propuesta de gobierno, y la vieron treinta personas");
    const blocks = parseReportMarkdown(md);
    expect(blocks.some((b) => b.t === "bajada")).toBe(true);
  });

  it("mete el espacio que falta entre el número de sección y el título", () => {
    expect(md).toContain("## 01 El escenario");
    expect(md).toContain("## 02 La primera propuesta de gobierno");
    expect(md).toContain("## 03 Si yo condujera la campaña");
    // El <span class="num">&nbsp;</span> de Fuentes no deja basura.
    expect(md).toContain("## Fuentes");
    expect(md).not.toContain("## 01El escenario");
  });

  it("convierte las tarjetas .kpi en un bloque ```kpi (valor | etiqueta | nota)", () => {
    expect(md).toContain(
      "```kpi\n3 | La propuesta de salud mental | Me gusta, contra 23 comentarios.\n19 | Cuentas nuevas | Casi todas del círculo de un dirigente.\n```",
    );
    const kpi = parseReportMarkdown(md).find((b): b is Extract<Block, { t: "kpi" }> => b.t === "kpi");
    expect(kpi?.items).toEqual([
      { value: "3", label: "La propuesta de salud mental", note: "Me gusta, contra 23 comentarios." },
      { value: "19", label: "Cuentas nuevas", note: "Casi todas del círculo de un dirigente." },
    ]);
  });

  it("descarta la cuenta regresiva del HTML (la escribe el código desde los hitos)", () => {
    expect(md).not.toContain("Dom 30-ago");
    expect(md).not.toContain("```countdown");
  });

  it("etiqueta las lecturas: .inf inline y .callout de bloque", () => {
    expect(md).toContain("**Inferencia** La relación invertida entre me gusta y comentarios");
    expect(md).toContain("**Advertencia** La denuncia sobre sueldos impagos");
    expect(md).toContain("**Inferencia** **Por primera vez una lista propuso algo concreto");
    const kinds = parseReportMarkdown(md)
      .filter((b): b is Extract<Block, { t: "callout" }> => b.t === "callout")
      .map((b) => b.kind);
    expect(kinds).toEqual(["inferencia", "inferencia", "advertencia"]);
  });

  it("mantiene las tablas como tablas markdown", () => {
    const table = parseReportMarkdown(md).find((b): b is Extract<Block, { t: "table" }> => b.t === "table");
    expect(table?.header).toEqual(["Pieza", "Me gusta", "Coment."]);
    expect(table?.rows[0][2]).toBe("23");
  });

  it("separa la píldora del título de la recomendación en vez de pegarlos", () => {
    expect(md).toContain("**Mañana** · Preparar la emisión como si fuera un acto");
    expect(md).not.toContain("MañanaPreparar");
  });

  it("tira script, style, header, img y la nota de scroll", () => {
    for (const basura of ["telemetria", "no-entra", "font-family", "Monitoreo de redes y elecciones", "base64", "Deslizá la tabla"]) {
      expect(md).not.toContain(basura);
    }
  });

  it("tira el <title> del documento: no es el título del informe", () => {
    expect(md).not.toContain("Informe Ferro 26-ago-2026");
  });

  it("las secciones quedan en orden y con el título limpio", () => {
    expect(sectionsOf(parseReportMarkdown(md)).map((s) => s.title).filter(Boolean)).toEqual([
      "01 El escenario",
      "02 La primera propuesta de gobierno",
      "03 Si yo condujera la campaña",
      "Fuentes",
    ]);
  });

  it("rechaza entradas por encima del límite de tamaño", () => {
    expect(() => htmlToMarkdown("<p>x</p>".repeat(MAX_IMPORT_CHARS))).toThrow(/400\.?000|400000/);
  });
});

describe("importReport", () => {
  beforeEach(() => {
    saveReport.mockClear();
    emailDailyReport.mockClear();
    emailDailyReport.mockResolvedValue({ sent: 2 });
    saveClientBrief.mockClear();
    brief = { entries: [], pendingUpdates: [], suggestions: [] };
    monitor = { ...monitor, calendar: [] };
  });

  const AT = "2026-08-26T15:30:00.000Z";

  it("markdown directo: guarda el informe con origen, título y conversación", async () => {
    const r = await importReport("p1", {
      markdown: "# Tesis del día\n\nLa bajada.\n\n## 01 El escenario\n\nTexto.\n",
      at: AT,
      origen: "claude-chrome",
      conversationUrl: "https://claude.ai/chat/x",
    });
    expect(r).toMatchObject({ at: AT, titulo: "Tesis del día", secciones: 1, briefUpdates: 0, mailSent: true });
    const [pid, report] = saveReport.mock.calls[0] as [string, import("@/lib/daily-report").DailyReport];
    expect(pid).toBe("p1");
    expect(report.origen).toBe("claude-chrome");
    expect(report.titulo).toBe("Tesis del día");
    expect(report.conversationUrl).toBe("https://claude.ai/chat/x");
    expect(report.items24h).toBe(12);
    expect(report.items7d).toBe(40);
  });

  it("HTML del informe de referencia: entra al historial con las secciones parseadas", async () => {
    const r = await importReport("p1", { html: FIXTURE, at: AT, origen: "import" });
    expect(r.titulo).toBe("Apareció la primera propuesta de gobierno, y la vieron treinta personas");
    expect(r.secciones).toBe(4);
    const [, report] = saveReport.mock.calls[0] as [string, import("@/lib/daily-report").DailyReport];
    expect(report.origen).toBe("import");
    expect(report.markdown).toContain("## 01 El escenario");
  });

  it("inserta la cuenta regresiva del código al inicio de la sección 01", async () => {
    monitor = { ...monitor, calendar: [{ label: "Elección", date: "2999-01-01" }] };
    await importReport("p1", { html: FIXTURE, at: AT, origen: "import" });
    const [, report] = saveReport.mock.calls[0] as [string, import("@/lib/daily-report").DailyReport];
    expect(report.markdown).toMatch(/## 01 El escenario\n\n```countdown\n\d+ \| Elección \| /);
  });

  it("sin h1: el título explícito se convierte en el h1", async () => {
    const r = await importReport("p1", {
      markdown: "## 01 El escenario\n\nTexto suelto.",
      titulo: "Un día sin tesis",
      at: AT,
      origen: "import",
    });
    expect(r.titulo).toBe("Un día sin tesis");
    const [, report] = saveReport.mock.calls[0] as [string, import("@/lib/daily-report").DailyReport];
    expect(report.markdown.startsWith("# Un día sin tesis")).toBe(true);
  });

  it("sin h1 ni título: la primera línea se convierte en el h1 (no se duplica)", async () => {
    const r = await importReport("p1", { markdown: "Lo que pasó hoy\n\nY después esto.", at: AT, origen: "import" });
    expect(r.titulo).toBe("Lo que pasó hoy");
    const [, report] = saveReport.mock.calls[0] as [string, import("@/lib/daily-report").DailyReport];
    expect(report.markdown).toBe("# Lo que pasó hoy\n\nY después esto.");
  });

  it("sin h1 ni título: un heading de sección no se degrada a h1, se antepone uno", async () => {
    const r = await importReport("p1", { markdown: "## 01 El escenario\n\nTexto suelto.", at: AT, origen: "import" });
    expect(r.titulo).toBe("01 El escenario");
    expect(r.secciones).toBe(1);
    const [, report] = saveReport.mock.calls[0] as [string, import("@/lib/daily-report").DailyReport];
    expect(report.markdown.startsWith("# 01 El escenario")).toBe(true);
    // La sección sigue siendo sección: el h1 no se la comió.
    expect(report.markdown).toContain("## 01 El escenario");
  });

  it("procesa el bloque ```json interno igual que el informe generado", async () => {
    const r = await importReport("p1", {
      markdown:
        "# Tesis\n\nBajada.\n\n## 01 El escenario\n\nTexto.\n\n```json\n" +
        JSON.stringify({
          briefUpdates: [{ seccion: "3.5", texto: "Cuenta nueva @identidadverdolaga" }],
          notaOperativa: "Faltan seguidores en dos cuentas.",
        }) +
        "\n```\n",
      at: AT,
      origen: "claude-chrome",
    });
    expect(r.briefUpdates).toBe(1);
    expect(brief.pendingUpdates?.[0]).toMatchObject({ seccion: "3.5", status: "pending", reportAt: AT });
    const [, report] = saveReport.mock.calls[0] as [string, import("@/lib/daily-report").DailyReport];
    expect(report.markdown).not.toContain("```json");
    expect(report.notaOperativa).toBe("Faltan seguidores en dos cuentas.");
  });

  it("suma las briefUpdates del argumento y las del json, sin duplicar", async () => {
    const r = await importReport("p1", {
      markdown: '# T\n\nB.\n\n## 01 X\n\nY.\n\n```json\n{"briefUpdates":[{"seccion":"3.5","texto":"A"}]}\n```\n',
      briefUpdates: [{ seccion: "3.5", texto: "A" }, { seccion: "4", texto: "B" }],
      at: AT,
      origen: "claude-chrome",
    });
    expect(r.briefUpdates).toBe(2);
    expect(brief.pendingUpdates?.map((u) => u.seccion)).toEqual(["3.5", "4"]);
  });

  it("enviarMail=false no manda nada y lo reporta", async () => {
    const r = await importReport("p1", { markdown: "# T\n\nB.\n\n## 01 X\n\nY.", at: AT, origen: "import", enviarMail: false });
    expect(emailDailyReport).not.toHaveBeenCalled();
    expect(r.mailSent).toBe(false);
  });

  it("si el mail falla, el informe igual queda guardado y vuelve el motivo", async () => {
    emailDailyReport.mockRejectedValueOnce(new Error("Resend 500"));
    const r = await importReport("p1", { markdown: "# T\n\nB.\n\n## 01 X\n\nY.", at: AT, origen: "import" });
    expect(saveReport).toHaveBeenCalledTimes(1);
    expect(r.mailSent).toBe(false);
    expect(r.mailError).toBe("Resend 500");
  });

  it("sin markdown ni html: error y no guarda nada", async () => {
    await expect(importReport("p1", { origen: "import" })).rejects.toThrow(/markdown|html/i);
    await expect(importReport("p1", { markdown: "   ", html: "", origen: "import" })).rejects.toThrow();
    expect(saveReport).not.toHaveBeenCalled();
  });

  it("sin ninguna sección reconocible: error y no guarda nada", async () => {
    await expect(importReport("p1", { html: "<html><body><script>x</script></body></html>", origen: "import" })).rejects.toThrow(
      /secci/i,
    );
    expect(saveReport).not.toHaveBeenCalled();
  });

  it("supera el límite de 400.000 caracteres: error y no guarda nada", async () => {
    await expect(importReport("p1", { markdown: "x".repeat(MAX_IMPORT_CHARS + 1), origen: "import" })).rejects.toThrow(
      /400\.?000|400000/,
    );
    expect(saveReport).not.toHaveBeenCalled();
  });

  it("fecha inválida: error y no guarda nada", async () => {
    await expect(importReport("p1", { markdown: "# T\n\nB.\n\n## 01 X\n\nY.", at: "ayer", origen: "import" })).rejects.toThrow(
      /fecha/i,
    );
    expect(saveReport).not.toHaveBeenCalled();
  });
});

describe("importReport · guardas de entrada", () => {
  beforeEach(() => {
    saveReport.mockClear();
    emailDailyReport.mockClear();
    emailDailyReport.mockResolvedValue({ sent: 2 });
    saveClientBrief.mockClear();
    brief = { entries: [], pendingUpdates: [], suggestions: [] };
    monitor = { ...monitor, calendar: [] };
  });

  const AT = "2026-08-26T15:30:00.000Z";

  it("sin secciones pero con calendario: la cuenta regresiva no salva el informe vacío", async () => {
    // El bloque ```countdown que inserta el código no es un bloque "h", así que
    // si la validación corre después de withCountdown un informe vacío pasa.
    monitor = { ...monitor, calendar: [{ label: "Elección", date: "2999-01-01" }] };
    await expect(
      importReport("p1", { html: "<html><body><script>x</script></body></html>", at: AT, origen: "import" }),
    ).rejects.toThrow(/secci/i);
    expect(saveReport).not.toHaveBeenCalled();
    expect(emailDailyReport).not.toHaveBeenCalled();
  });

  it("recorta el markdown guardado en MAX_STORED_CHARS", async () => {
    const largo = `# Tesis\n\nBajada.\n\n## 01 El escenario\n\n${"palabra ".repeat(9000)}`;
    expect(largo.length).toBeGreaterThan(MAX_STORED_CHARS);
    await importReport("p1", { markdown: largo, at: AT, origen: "import" });
    const [, report] = saveReport.mock.calls[0] as [string, import("@/lib/daily-report").DailyReport];
    expect(report.markdown).toHaveLength(MAX_STORED_CHARS);
    expect(report.markdown.startsWith("# Tesis")).toBe(true);
  });

  it("no recorta un informe por debajo del tope", async () => {
    await importReport("p1", { markdown: "# T\n\nB.\n\n## 01 X\n\nY.", at: AT, origen: "import" });
    const [, report] = saveReport.mock.calls[0] as [string, import("@/lib/daily-report").DailyReport];
    expect(report.markdown.length).toBeLessThan(MAX_STORED_CHARS);
  });
});

describe("importReport · fecha del informe", () => {
  beforeEach(() => {
    saveReport.mockClear();
    emailDailyReport.mockClear();
    emailDailyReport.mockResolvedValue({ sent: 2 });
    brief = { entries: [], pendingUpdates: [], suggestions: [] };
    monitor = { ...monitor, calendar: [] };
  });

  const CUERPO = "# T\n\nB.\n\n## 01 X\n\nY.";

  it("acepta la forma ISO y la normaliza", async () => {
    const r = await importReport("p1", { markdown: CUERPO, at: "2026-08-26", origen: "import" });
    expect(r.at).toBe("2026-08-26T00:00:00.000Z");
  });

  it("rechaza fechas que no son ISO aunque Date.parse las entienda", async () => {
    for (const at of ["26/08/2026", "Aug 26 2026", "ayer", "2026", "20260826"]) {
      await expect(importReport("p1", { markdown: CUERPO, at, origen: "import" })).rejects.toThrow(/fecha/i);
    }
    expect(saveReport).not.toHaveBeenCalled();
  });

  it("rechaza una fecha más de 6 h en el futuro", async () => {
    const futuro = new Date(Date.now() + 7 * 3600_000).toISOString();
    await expect(importReport("p1", { markdown: CUERPO, at: futuro, origen: "import" })).rejects.toThrow(/futur/i);
    expect(saveReport).not.toHaveBeenCalled();
  });

  it("acepta un margen de hasta 6 h por diferencia de reloj", async () => {
    const casi = new Date(Date.now() + 3600_000).toISOString();
    const r = await importReport("p1", { markdown: CUERPO, at: casi, origen: "import" });
    expect(r.at).toBe(casi);
  });
});
