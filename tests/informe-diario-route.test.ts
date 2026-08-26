import { describe, it, expect, vi } from "vitest";

const project = { current: { id: "p1", nombre: "Ibicuy", role: "owner" } as { id: string; nombre: string; role: string } | null };
vi.mock("@/lib/workspace", () => ({
  requireProject: async () => {
    if (!project.current) throw new Error("REDIRECT");
    return project.current;
  },
}));
vi.mock("@/lib/listening-config", () => ({ getListeningConfig: async () => ({ zona: "Ibicuy" }) }));
vi.mock("@/lib/daily-report", () => ({
  readDailyReports: async () => ({
    latest: { at: "2026-08-25T12:00:00.000Z", markdown: "## 1. Resumen ejecutivo\nHola", items24h: 1, items7d: 2 },
    history: [{ at: "2026-08-24T12:00:00.000Z", markdown: "## 1. Resumen ejecutivo\nAyer", items24h: 1, items7d: 2 }],
  }),
}));
const { renderDailyReportPdf } = vi.hoisted(() => ({
  renderDailyReportPdf: vi.fn(async () => Buffer.from("%PDF-1.4 x")),
}));
vi.mock("@/lib/pdf/daily-report-pdf", () => ({ renderDailyReportPdf }));

import { GET } from "@/app/(dashboard)/escucha/informe-diario/route";

describe("GET /escucha/informe-diario", () => {
  it("redirige sin proyecto activo", async () => {
    project.current = null;
    await expect(
      GET(new Request("https://a/escucha/informe-diario?at=2026-08-25T12:00:00.000Z")),
    ).rejects.toThrow("REDIRECT");
    project.current = { id: "p1", nombre: "Ibicuy", role: "owner" };
  });
  it("404 si no hay informe con ese at", async () => {
    const res = await GET(new Request("https://a/escucha/informe-diario?at=2020-01-01T00:00:00.000Z"));
    expect(res.status).toBe(404);
  });
  it("200 pdf del historial con nombre de archivo", async () => {
    const res = await GET(new Request("https://a/escucha/informe-diario?at=2026-08-24T12:00:00.000Z"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain('filename="informe-ibicuy-2026-08-24.pdf"');
  });
  it("500 si falla la generación del PDF", async () => {
    renderDailyReportPdf.mockRejectedValueOnce(new Error("boom"));
    const res = await GET(new Request("https://a/escucha/informe-diario?at=2026-08-24T12:00:00.000Z"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "pdf_failed" });
  });
});
