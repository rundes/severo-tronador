import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
vi.stubGlobal("fetch", fetchMock);
vi.mock("@/lib/connectors/config", () => ({
  getConnectorConfig: async () => ({ RESEND_API_KEY: "re_test", RESEND_FROM: "t@x.ar" }),
}));
vi.mock("@/lib/projects", () => ({
  getProject: async () => ({ id: "p1", nombre: "Ibicuy" }),
  listMembers: async () => [{ email: "o@x.ar", role: "owner" }, { email: "e@x.ar", role: "editor" }],
}));
vi.mock("@/lib/listening-config", () => ({ getListeningConfig: async () => ({ zona: "Ibicuy, Entre Ríos", keywords: [] }) }));
const pdfMock = vi.fn(async () => Buffer.from("%PDF-1.4 fake"));
vi.mock("@/lib/pdf/daily-report-pdf", () => ({ renderDailyReportPdf: (...a: unknown[]) => pdfMock(...(a as [])) }));

import { emailDailyReport } from "@/lib/daily-report";

const report = { at: "2026-08-25T12:00:00.000Z", markdown: "## 1. Resumen ejecutivo\nHola.", items24h: 1, items7d: 2 };

describe("emailDailyReport", () => {
  beforeEach(() => { fetchMock.mockClear(); pdfMock.mockReset(); pdfMock.mockResolvedValue(Buffer.from("%PDF-1.4 fake")); });

  it("manda HTML diseñado + PDF adjunto solo a owners", async () => {
    const r = await emailDailyReport("p1", report);
    expect(r.sent).toBe(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toBe("o@x.ar");
    expect(body.subject).toMatch(/Ibicuy/);
    expect(body.html).toContain("Resumen ejecutivo");
    expect(body.html).not.toContain("white-space:pre-wrap");
    expect(body.text).toBe(report.markdown);
    expect(body.attachments).toHaveLength(1);
    expect(body.attachments[0].filename).toBe("informe-ibicuy-2026-08-25.pdf");
    expect(Buffer.from(body.attachments[0].content, "base64").toString()).toBe("%PDF-1.4 fake");
  });

  it("si el PDF falla, el mail sale sin adjunto", async () => {
    pdfMock.mockRejectedValueOnce(new Error("boom"));
    const r = await emailDailyReport("p1", report);
    expect(r.sent).toBe(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.attachments).toEqual([]);
  });
});
