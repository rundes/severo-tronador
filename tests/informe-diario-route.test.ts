import { describe, it, expect, vi } from "vitest";

const project = { current: { id: "p1", nombre: "Ibicuy", role: "owner" } as { id: string; nombre: string; role: string } | null };
vi.mock("@/lib/workspace", () => ({ getActiveProject: async () => project.current }));
vi.mock("@/lib/listening-config", () => ({ getListeningConfig: async () => ({ zona: "Ibicuy" }) }));
vi.mock("@/lib/daily-report", () => ({
  readDailyReports: async () => ({
    latest: { at: "2026-08-25T12:00:00.000Z", markdown: "## 1. Resumen ejecutivo\nHola", items24h: 1, items7d: 2 },
    history: [{ at: "2026-08-24T12:00:00.000Z", markdown: "## 1. Resumen ejecutivo\nAyer", items24h: 1, items7d: 2 }],
  }),
}));
vi.mock("@/lib/pdf/daily-report-pdf", () => ({ renderDailyReportPdf: async () => Buffer.from("%PDF-1.4 x") }));

import { GET } from "@/app/(dashboard)/escucha/informe-diario/route";

describe("GET /escucha/informe-diario", () => {
  it("403 sin proyecto activo", async () => {
    project.current = null;
    const res = await GET(new Request("https://a/escucha/informe-diario?at=2026-08-25T12:00:00.000Z"));
    expect(res.status).toBe(403);
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
});
