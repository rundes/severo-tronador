// tests/extension-breaker.test.ts
// El breaker es la única defensa del plugin contra un bloqueo: si el DOM de la
// plataforma ya muestra el muro de login o "algo salió mal", seguir pidiendo es
// pedir la cuenta. Las señales tienen que caer en el enum de lib/monitor-breaker.
import { describe, it, expect } from "vitest";
import { signalFromResponse } from "../infra/escucha-extension/core/breaker.js";

const SIGNALS = ["http_429", "http_401_403", "checkpoint", "try_later", "captcha", "empty_streak"];

describe("breaker · status", () => {
  it("429 y 401/403", () => {
    expect(signalFromResponse(429, "")).toBe("http_429");
    expect(signalFromResponse(401, "")).toBe("http_401_403");
    expect(signalFromResponse(403, "")).toBe("http_401_403");
  });
  it("200 con cuerpo limpio → null", () => {
    expect(signalFromResponse(200, "ganamos de local, 2 a 0")).toBeNull();
    expect(signalFromResponse(200, "")).toBeNull();
    expect(signalFromResponse(200, undefined)).toBeNull();
  });
});

describe("breaker · texto del DOM", () => {
  it("captcha y checkpoint ganan sobre el resto", () => {
    expect(signalFromResponse(200, "resolvé el CAPTCHA para seguir")).toBe("captcha");
    expect(signalFromResponse(200, "https://www.instagram.com/challenge/?next=/")).toBe("checkpoint");
    expect(signalFromResponse(200, "/checkpoint/dismiss")).toBe("checkpoint");
  });
  it("muro de login de X → http_401_403", () => {
    expect(signalFromResponse(200, "Redirigiendo a /i/flow/login?redirect_after_login=/FerroOficial")).toBe("http_401_403");
    expect(signalFromResponse(200, "Inicia sesión para ver más publicaciones")).toBe("http_401_403");
    expect(signalFromResponse(200, "Log in to X to see this post")).toBe("http_401_403");
  });
  it("errores blandos → try_later", () => {
    expect(signalFromResponse(200, "Try again later")).toBe("try_later");
    expect(signalFromResponse(200, "Intentá más tarde")).toBe("try_later");
    expect(signalFromResponse(200, "Something went wrong. Try reloading.")).toBe("try_later");
    expect(signalFromResponse(200, "Algo salió mal, pero no es tu culpa.")).toBe("try_later");
  });
  it("toda señal cae en el enum del server", () => {
    for (const body of ["captcha", "/checkpoint", "/i/flow/login", "algo salió mal"]) {
      expect(SIGNALS).toContain(signalFromResponse(200, body));
    }
  });
  it("solo mira los primeros 4000 caracteres", () => {
    expect(signalFromResponse(200, "x".repeat(4100) + "captcha")).toBeNull();
  });
});
