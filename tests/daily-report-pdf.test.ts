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
});
