import { describe, it, expect } from "vitest";
import { renderReportEmail } from "@/lib/report-html";
import { reportFilename } from "@/lib/report-file";

const report = {
  at: "2026-08-25T12:00:00.000Z",
  markdown: "# Informe\n\n## 1. Resumen ejecutivo\nHoy **importa** el río.\n\n## 2. Temas del día\n- Cloacas <script>x</script>\n\n## 5. Sugerencia operativa\nPreguntar por cloacas.",
  items24h: 12,
  items7d: 80,
  pull: { total: 30, bySource: {}, errors: [{ source: "x", detail: "429" }] },
};

describe("renderReportEmail", () => {
  const out = renderReportEmail({ report, project: "Ibicuy", zona: "Ibicuy, Entre Ríos", appUrl: "https://app.test" });

  it("subject con proyecto y fecha; text = markdown", () => {
    expect(out.subject).toMatch(/Informe de escucha · Ibicuy · 25\/08\/2026/);
    expect(out.text).toBe(report.markdown);
  });

  it("html con cabecera, chips, secciones, sugerencia destacada y link", () => {
    expect(out.html).toContain("Ibicuy");
    expect(out.html).toContain("12 menciones");
    expect(out.html).toContain("80 en 7 d");
    expect(out.html).toContain("1 fuente con error");
    expect(out.html).toContain("Resumen ejecutivo");
    expect(out.html).toContain("<strong>importa</strong>");
    expect(out.html).toContain("Sugerencia operativa");
    expect(out.html).toContain('href="https://app.test/escucha?tab=informe"');
  });

  it("escapa HTML del contenido y no trae script ni css externo", () => {
    expect(out.html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(out.html).not.toMatch(/<script/i);
    expect(out.html).not.toMatch(/<link|@import|url\(/i);
  });

  it("markdown vacío → placeholder", () => {
    const r = renderReportEmail({ report: { ...report, markdown: "" }, project: "P", zona: "", appUrl: "https://a" });
    expect(r.html).toContain("Informe sin contenido");
  });
});

describe("reportFilename", () => {
  it("slug del proyecto + fecha", () => {
    expect(reportFilename("Rio Grande - TDF", "2026-08-25T12:00:00.000Z")).toBe("informe-rio-grande-tdf-2026-08-25.pdf");
  });
});

const editorial = {
  at: "2026-08-26T12:00:00.000Z",
  markdown: [
    "# Ferro llega dividido a la asamblea",
    "",
    "Las tres agrupaciones cerraron la semana sin fórmula.",
    "",
    "## 01 El escenario",
    "",
    "```countdown",
    "12 | Asamblea de socios | esta semana",
    "40 | Elección de comisión | 6 semanas",
    "```",
    "",
    "Narrativa del escenario.",
    "",
    "## 02 Lo que cambió",
    "",
    "```kpi",
    "312 | menciones 24 h | +18% vs ayer",
    "4 | historias vivas | tres agrupaciones",
    "```",
    "",
    "**Inferencia** — la cadencia responde al calendario, no a la coyuntura.",
    "",
    "**Advertencia:** la denuncia es una declaración pública, no un hecho probado.",
  ].join("\n"),
  items24h: 312,
  items7d: 1200,
};

describe("renderReportEmail · bloques editoriales", () => {
  const out = renderReportEmail({ report: editorial, project: "Ferro", zona: "Caballito", appUrl: "https://app.test" });

  it("bajada, countdown con días y etiqueta, kpi con valor y etiqueta", () => {
    expect(out.html).toContain("Las tres agrupaciones cerraron la semana sin fórmula.");
    expect(out.html).toContain('data-block="countdown"');
    expect(out.html).toContain("Asamblea de socios");
    expect(out.html).toContain(">12<");
    expect(out.html).toContain('data-block="kpi"');
    expect(out.html).toContain("menciones 24 h");
    expect(out.html).toContain(">312<");
  });

  it("callouts con su kind y su etiqueta visible", () => {
    expect(out.html).toContain('data-callout="inferencia"');
    expect(out.html).toContain('data-callout="advertencia"');
    expect(out.html).toContain("Inferencia");
    expect(out.html).toContain("Advertencia");
    expect(out.html).toContain("la cadencia responde al calendario, no a la coyuntura.");
  });

  it("sigue sin traer script ni css externo", () => {
    expect(out.html).not.toMatch(/<script/i);
    expect(out.html).not.toMatch(/<link|@import|url\(/i);
  });
});
