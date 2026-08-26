// tests/extension-candidates-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const { classify } = vi.hoisted(() => ({ classify: vi.fn() }));
vi.mock("@/lib/extension-token", () => ({ verifyExtensionToken: async (t: string | null) => (t === "ok" ? "p1" : null) }));
vi.mock("@/lib/candidate-ai", () => ({ classifyCandidates: (...a: unknown[]) => classify(...(a as [])) }));
let brief = { entries: [], suggestions: [{ id: "x:viejo", handle: "viejo", platform: "x", category: "medio", direccion: "?", razon: "", suggestedAt: "2026-08-20T00:00:00.000Z", status: "dismissed" }] };
const save = vi.fn(async (_p: string, b: typeof brief) => { brief = b; });
vi.mock("@/lib/client-brief", async (o) => ({ ...(await o<typeof import("@/lib/client-brief")>()), getClientBrief: async () => brief, saveClientBrief: (p: string, b: typeof brief) => save(p, b) }));
vi.mock("@/lib/monitor-config", async (o) => ({ ...(await o<typeof import("@/lib/monitor-config")>()), getMonitorConfig: async () => ({ accounts: [{ handle: "enplan", platform: "x", category: "medio" }], searchesA: [], searchesB: [], entidades: {}, noRepetir: [], calendar: [], budget: {} }) }));

import { POST } from "@/app/api/extension/candidates/route";
const req = (body: unknown, token = "ok") => new Request("https://a/api/extension/candidates", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
const cand = (handle: string, platform = "x") => ({ platform, handle, sample: [{ url: `https://x.com/${handle}/status/1`, text: "t" }] });

describe("POST /api/extension/candidates", () => {
  beforeEach(() => { classify.mockReset(); save.mockClear(); });

  it("403 sin token válido", async () => {
    expect((await POST(req({ candidates: [] }, "bad"))).status).toBe(403);
  });
  it("filtra los ya conocidos (plan y sugerencias previas) y no llama a la IA si no queda nada", async () => {
    const res = await POST(req({ candidates: [cand("enplan"), cand("Viejo")] }));
    expect(await res.json()).toEqual({ ok: true, evaluated: 0, suggested: 0 });
    expect(classify).not.toHaveBeenCalled();
  });
  it("clasifica los nuevos y guarda sugerencias con origen barrido", async () => {
    classify.mockResolvedValue([{ handle: "nuevo", platform: "x", category: "organizacion", direccion: "B", razon: "r", evidencia: "https://x.com/nuevo/status/1", origen: "barrido" }]);
    const res = await POST(req({ candidates: [cand("nuevo"), cand("otro")] }));
    expect(await res.json()).toEqual({ ok: true, evaluated: 2, suggested: 1 });
    expect(classify.mock.calls[0][1].map((c: { handle: string }) => c.handle)).toEqual(["nuevo", "otro"]);
    expect(brief.suggestions.find((s) => s.handle === "nuevo")).toMatchObject({ status: "pending", origen: "barrido" });
  });
  it("502 si la IA falla", async () => {
    classify.mockRejectedValue(new Error("boom"));
    expect((await POST(req({ candidates: [cand("z")] }))).status).toBe(502);
  });
});
