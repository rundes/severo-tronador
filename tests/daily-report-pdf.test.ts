import { describe, it, expect } from "vitest";
import { renderDailyReportPdf } from "@/lib/pdf/daily-report-pdf";

describe("renderDailyReportPdf", () => {
  it("devuelve un PDF válido con el contenido", async () => {
    const buf = await renderDailyReportPdf({
      report: {
        at: "2026-08-25T12:00:00.000Z",
        markdown:
          "## 1. Resumen ejecutivo\nHoy **importa** el río.\n\n- a\n- b\n\n| T | V |\n|---|---|\n| x | 1 |",
        items24h: 3,
        items7d: 9,
      },
      project: "Ibicuy",
      zona: "Ibicuy, Entre Ríos",
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(1500);
  }, 30_000);

  it("rinde bajada, countdown, kpi y callouts sin romper", async () => {
    const buf = await renderDailyReportPdf({
      report: {
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
          "## 02 Lo que cambió",
          "",
          "```kpi",
          "312 | menciones 24 h | +18% vs ayer",
          "```",
          "",
          "**Inferencia** — la cadencia responde al calendario.",
          "",
          "**Advertencia:** la denuncia es una declaración pública.",
        ].join("\n"),
        items24h: 312,
        items7d: 1200,
      },
      project: "Ferro",
      zona: "Caballito",
    });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(2000);
  }, 30_000);
});
