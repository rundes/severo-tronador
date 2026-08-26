// tests/extension-candidates-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const { classify } = vi.hoisted(() => ({ classify: vi.fn() }));
vi.mock("@/lib/extension-token", () => ({ verifyExtensionToken: async (t: string | null) => (t === "ok" ? "p1" : null) }));
vi.mock("@/lib/candidate-ai", () => ({ classifyCandidates: (...a: unknown[]) => classify(...(a as [])) }));
let brief = { entries: [], suggestions: [{ id: "x:viejo", handle: "viejo", platform: "x", category: "medio", direccion: "?", razon: "", suggestedAt: "2026-08-20T00:00:00.000Z", status: "dismissed" }] };
const save = vi.fn(async (_p: string, b: typeof brief) => { brief = b; });
const getBrief = vi.fn(async () => brief);
vi.mock("@/lib/client-brief", async (o) => ({ ...(await o<typeof import("@/lib/client-brief")>()), getClientBrief: () => getBrief(), saveClientBrief: (p: string, b: typeof brief) => save(p, b) }));
vi.mock("@/lib/monitor-config", async (o) => ({ ...(await o<typeof import("@/lib/monitor-config")>()), getMonitorConfig: async () => ({ accounts: [{ handle: "enplan", platform: "x", category: "medio" }], searchesA: [], searchesB: [], entidades: {}, noRepetir: [], calendar: [], budget: {} }) }));

import { POST } from "@/app/api/extension/candidates/route";
const req = (body: unknown, token = "ok") => new Request("https://a/api/extension/candidates", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
const cand = (handle: string, platform = "x") => ({ platform, handle, sample: [{ url: `https://x.com/${handle}/status/1`, text: "t" }] });

describe("POST /api/extension/candidates", () => {
  beforeEach(() => { classify.mockReset(); save.mockClear(); getBrief.mockReset(); getBrief.mockImplementation(async () => brief); });

  it("403 sin token válido", async () => {
    expect((await POST(req({ candidates: [] }, "bad"))).status).toBe(403);
  });
  it("filtra los ya conocidos (plan y sugerencias previas) y no llama a la IA si no queda nada", async () => {
    const res = await POST(req({ candidates: [cand("enplan"), cand("Viejo")] }));
    expect(await res.json()).toEqual({ ok: true, evaluated: 0, suggested: 0, dropped: 0 });
    expect(classify).not.toHaveBeenCalled();
  });
  it("clasifica los nuevos y guarda sugerencias con origen barrido", async () => {
    classify.mockResolvedValue([{ handle: "nuevo", platform: "x", category: "organizacion", direccion: "B", razon: "r", evidencia: "https://x.com/nuevo/status/1", origen: "barrido" }]);
    const res = await POST(req({ candidates: [cand("nuevo"), cand("otro")] }));
    expect(await res.json()).toEqual({ ok: true, evaluated: 2, suggested: 1, dropped: 0 });
    expect(classify.mock.calls[0][1].map((c: { handle: string }) => c.handle)).toEqual(["nuevo", "otro"]);
    expect(brief.suggestions.find((s) => s.handle === "nuevo")).toMatchObject({ status: "pending", origen: "barrido" });
  });
  it("relee el brief después de la IA y no pisa cambios del operador (lost update)", async () => {
    const suggestion = (handle: string, status = "pending") => ({ id: `x:${handle}`, handle, platform: "x", category: "medio", direccion: "?", razon: "", suggestedAt: "2026-08-20T00:00:00.000Z", status });
    const stale = { entries: [], suggestions: [suggestion("viejo", "dismissed")] };
    const freshBrief = { entries: [], suggestions: [suggestion("viejo", "accepted"), suggestion("operador")] };
    getBrief.mockResolvedValueOnce(stale).mockResolvedValueOnce(freshBrief);
    classify.mockResolvedValue([{ handle: "nuevo", platform: "x", category: "organizacion", direccion: "B", razon: "r", origen: "barrido" }]);
    const res = await POST(req({ candidates: [cand("nuevo")] }));
    expect(await res.json()).toEqual({ ok: true, evaluated: 1, suggested: 1, dropped: 0 });
    expect(getBrief).toHaveBeenCalledTimes(2);
    const saved = save.mock.calls[0][1];
    expect(saved.suggestions.map((s) => `${s.handle}:${s.status}`)).toEqual(["viejo:accepted", "operador:pending", "nuevo:pending"]);
  });
  it("suggested cuenta solo las agregadas de verdad (ya sugeridas entre lectura y guardado no cuentan)", async () => {
    const base = { entries: [], suggestions: [] as typeof brief.suggestions };
    const freshBrief = { entries: [], suggestions: [{ id: "x:nuevo", handle: "nuevo", platform: "x", category: "medio", direccion: "?", razon: "", suggestedAt: "2026-08-20T00:00:00.000Z", status: "pending" }] };
    getBrief.mockResolvedValueOnce(base).mockResolvedValueOnce(freshBrief);
    classify.mockResolvedValue([{ handle: "nuevo", platform: "x", category: "organizacion", direccion: "B", razon: "r", origen: "barrido" }]);
    const res = await POST(req({ candidates: [cand("nuevo")] }));
    expect(await res.json()).toEqual({ ok: true, evaluated: 1, suggested: 0, dropped: 0 });
    expect(save).not.toHaveBeenCalled();
  });
  it("tolera ítems inválidos: los descarta y cuenta dropped, sin tirar el lote", async () => {
    classify.mockResolvedValue([]);
    const res = await POST(req({ candidates: [cand("bueno"), { platform: "marte", handle: "x" }, { platform: "x" }, "basura"] }));
    expect(await res.json()).toEqual({ ok: true, evaluated: 1, suggested: 0, dropped: 3 });
    expect(classify.mock.calls[0][1].map((c: { handle: string }) => c.handle)).toEqual(["bueno"]);
  });
  it("400 solo si candidates no es array o supera 60", async () => {
    expect((await POST(req({ candidates: "no" }))).status).toBe(400);
    expect((await POST(req({}))).status).toBe(400);
    expect((await POST(req({ candidates: Array.from({ length: 61 }, (_, i) => cand(`h${i}`)) }))).status).toBe(400);
  });
  it("acepta searches con cualquier forma sin validarlo estrictamente", async () => {
    classify.mockResolvedValue([]);
    const res = await POST(req({ candidates: [cand("bueno")], searches: "lo que sea" }));
    expect(res.status).toBe(200);
  });
  it("descarta handles con forma inválida o rutas reservadas de la plataforma", async () => {
    classify.mockResolvedValue([]);
    const res = await POST(req({ candidates: [cand("@Bueno_1.a-b"), cand("profile.php"), cand("con espacio"), cand("Reel"), cand("groups"), cand("ñandu"), cand("a".repeat(81))] }));
    expect(await res.json()).toEqual({ ok: true, evaluated: 1, suggested: 0, dropped: 6 });
    expect(classify.mock.calls[0][1].map((c: { handle: string }) => c.handle)).toEqual(["bueno_1.a-b"]);
  });
  it("filtra muestras con url no http(s) y trunca campos largos en vez de descartar el candidato", async () => {
    classify.mockResolvedValue([]);
    const res = await POST(req({ candidates: [{
      platform: "x", handle: "largo", displayName: "n".repeat(200), bio: "b".repeat(400),
      sample: [
        { url: "javascript:alert(1)", text: "mal" },
        { url: "ftp://x.com/a", text: "mal" },
        { url: "no-es-url", text: "mal" },
        { url: "https://x.com/largo/status/1", text: "t".repeat(600) },
      ],
    }] }));
    expect(await res.json()).toEqual({ ok: true, evaluated: 1, suggested: 0, dropped: 0 });
    const sent = classify.mock.calls[0][1][0];
    expect(sent.displayName).toHaveLength(120);
    expect(sent.bio).toHaveLength(300);
    expect(sent.sample).toHaveLength(1);
    expect(sent.sample[0].url).toBe("https://x.com/largo/status/1");
    expect(sent.sample[0].text).toHaveLength(500);
  });
  it("502 si la IA falla", async () => {
    classify.mockRejectedValue(new Error("boom"));
    expect((await POST(req({ candidates: [cand("z")] }))).status).toBe(502);
  });
});
