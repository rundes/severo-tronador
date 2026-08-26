import { describe, it, expect, vi, beforeEach } from "vitest";
const trip = vi.fn(async () => {});
const saveRun = vi.fn(async () => {});
vi.mock("@/lib/extension-token", () => ({ verifyExtensionToken: async (t: string | null) => (t === "ok" ? "p1" : null) }));
vi.mock("@/lib/monitor-breaker", () => ({ tripBreaker: (...a: unknown[]) => trip(...(a as [])) }));
vi.mock("@/lib/extension-run", () => ({ saveExtensionRun: (...a: unknown[]) => saveRun(...(a as [])) }));
import { POST } from "@/app/api/extension/signal/route";

const req = (body: unknown, token = "ok") =>
  new Request("https://a/api/extension/signal", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/extension/signal", () => {
  beforeEach(() => { trip.mockClear(); saveRun.mockClear(); });

  it("403 sin token válido", async () => {
    expect((await POST(req({ platform: "x", signal: "http_429" }, "bad"))).status).toBe(403);
  });

  it("señal de breaker: sigue enfriando la plataforma", async () => {
    const res = await POST(req({ platform: "x", signal: "http_429" }));
    expect(res.status).toBe(200);
    expect(trip).toHaveBeenCalledWith("p1", "x", "http_429");
    expect(saveRun).not.toHaveBeenCalled();
  });

  it("run-summary: guarda la corrida y no toca el breaker", async () => {
    const res = await POST(req({
      kind: "run-summary", cuentas: 6, busquedas: 4, items: 41, candidatos: 12, sugeridos: 2,
      errores: [{ platform: "instagram", handle: "ferrooficial", step: "feed", detail: "HTTP 400" }],
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(trip).not.toHaveBeenCalled();
    expect(saveRun).toHaveBeenCalledWith("p1", {
      cuentas: 6, busquedas: 4, items: 41, candidatos: 12, sugeridos: 2,
      errores: [{ platform: "instagram", handle: "ferrooficial", step: "feed", detail: "HTTP 400" }],
    });
  });

  it("run-summary sin errores: errores por defecto []", async () => {
    const res = await POST(req({ kind: "run-summary", cuentas: 1, busquedas: 0, items: 0, candidatos: 0, sugeridos: 0 }));
    expect(res.status).toBe(200);
    expect((saveRun.mock.calls[0] as unknown as [string, { errores: unknown[] }])[1].errores).toEqual([]);
  });

  it("400 con payload que no es ni señal ni run-summary", async () => {
    expect((await POST(req({ platform: "marte", signal: "http_429" }))).status).toBe(400);
    expect((await POST(req({ kind: "run-summary" }))).status).toBe(400);
  });
});
