// Sink de errores del servidor (F4.2 del plan de mejoras).
//
// No había ninguno: un throw en una server action o en una ruta API se perdía
// en los logs de Vercel. Esto da el punto único por donde pasan todos, con
// contexto normalizado y sin acoplar a un SDK.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { captureError } from "@/lib/error-sink";

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("captureError", () => {
  it("sin ERROR_WEBHOOK_URL no sale a la red", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await captureError(new Error("boom"), { source: "route", path: "/x" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("con webhook manda el error serializado", async () => {
    vi.stubEnv("ERROR_WEBHOOK_URL", "https://hook.test/err");
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);

    await captureError(new Error("explotó"), {
      source: "action",
      path: "/campanas",
      method: "POST",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://hook.test/err");
    const body = JSON.parse((init as { body: string }).body);
    expect(body.message).toBe("explotó");
    expect(body.source).toBe("action");
    expect(body.path).toBe("/campanas");
    expect(body.stack).toBeTruthy();
  });

  it("recorta mensajes largos y stacks profundos", async () => {
    // Un stack completo en un webhook de Slack es ruido, y un mensaje puede
    // traer un payload entero pegado.
    vi.stubEnv("ERROR_WEBHOOK_URL", "https://hook.test/err");
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);

    const err = new Error("x".repeat(2000));
    err.stack = Array.from({ length: 60 }, (_, i) => `  at frame${i}`).join("\n");
    await captureError(err, { source: "route" });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.message.length).toBe(500);
    expect(body.stack.split("\n").length).toBe(12);
  });

  it("un error no-Error tampoco rompe", async () => {
    vi.stubEnv("ERROR_WEBHOOK_URL", "https://hook.test/err");
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);
    await captureError("string suelto", { source: "cron" });
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.message).toBe("string suelto");
    expect(body.stack).toBeUndefined();
  });

  it("si el webhook falla, captureError no propaga", async () => {
    // El sink no puede voltear el request que lo llamó.
    vi.stubEnv("ERROR_WEBHOOK_URL", "https://hook.test/err");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("hook caído")));
    await expect(
      captureError(new Error("boom"), { source: "route" }),
    ).resolves.toBeUndefined();
  });
});
