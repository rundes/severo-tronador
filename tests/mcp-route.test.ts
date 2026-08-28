import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted: los factories de vi.mock se izan por encima de los `const` del
// archivo, así que todo lo que un factory referencia tiene que declararse acá
// (mismo patrón que tests/extension-candidates-route.test.ts).
const {
  createMcpHandler,
  registros,
  opciones,
  resultados,
  correrTool,
  pendiente,
  verifyMcpToken,
  touchClaudeLink,
  toolHandler,
} = vi.hoisted(() => {
  type Resultado = { content: { type: string; text: string }[]; isError?: boolean };
  interface Registro {
    name: string;
    config: Record<string, unknown>;
    cb: (args: unknown) => Promise<Resultado>;
  }
  const registros: Registro[][] = [];
  const opciones: Record<string, unknown>[] = [];
  const resultados: Resultado[] = [];
  // Si el request "ejecuta una tool" o no: initialize y tools/list llegan en
  // cada handshake y no son "uso".
  const correrTool = { value: false };
  // Promesa de la tool en vuelo. El mock imita el leg legacy stateless de
  // mcp-handler: despacha el mensaje SIN esperarlo y devuelve el Response (un
  // stream SSE) antes de que la tool corra. Por eso el test espera ACÁ para
  // ver el efecto de la tool, y por eso la ruta no puede agendar la telemetría
  // después de `await handler(req)`.
  const pendiente: { value: Promise<void> } = { value: Promise.resolve() };
  const toolHandler = vi.fn(async () => "texto de la tool");
  // El handler real de mcp-handler no se ejerce acá (eso es
  // tests/mcp-route-real.test.ts): lo que importa es que la ruta NO delegue si
  // el token no vale, que cuando delega registre las tools del proyecto
  // resuelto, y que el envoltorio del protocolo sea el correcto.
  const createMcpHandler = vi.fn(
    (init: (server: unknown) => void, opts: Record<string, unknown> = {}) => {
      const lote: Registro[] = [];
      init({
        registerTool: (name: string, config: Record<string, unknown>, cb: Registro["cb"]) => {
          lote.push({ name, config, cb });
        },
        server: { getClientVersion: () => ({ name: "claude-ai", version: "1.0" }) },
      });
      registros.push(lote);
      opciones.push(opts);
      return async () => {
        if (correrTool.value) {
          pendiente.value = (async () => {
            await new Promise((r) => setTimeout(r, 0));
            resultados.push(await lote[0].cb({}));
          })();
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      };
    },
  );
  return {
    createMcpHandler,
    registros,
    opciones,
    resultados,
    correrTool,
    pendiente,
    toolHandler,
    verifyMcpToken: vi.fn(async (t: string | null) => (t && t.startsWith("ok") ? "p1" : null)),
    touchClaudeLink: vi.fn(async () => {}),
  };
});

vi.mock("mcp-handler", () => ({ createMcpHandler }));
vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }));
vi.mock("@/lib/mcp-token", () => ({ verifyMcpToken }));
vi.mock("@/lib/claude-link", () => ({ touchClaudeLink }));
vi.mock("@/lib/mcp/tools", () => ({
  TOOL_NAMES: ["get_brief"],
  makeTools: (projectId: string) => [
    {
      name: "get_brief",
      title: "Brief",
      description: `Brief de ${projectId}`,
      inputSchema: { parse: (x: unknown) => x },
      handler: toolHandler,
    },
  ],
}));

import { GET, POST, DELETE } from "@/app/api/mcp/[token]/[transport]/route";
import { rateLimitOk, RATE_LIMIT } from "@/lib/mcp/rate-limit";

const ctx = (token: string, transport = "mcp") => ({ params: Promise.resolve({ token, transport }) });

// El balde por IP es global al módulo y sobrevive entre tests: sin una IP
// distinta por request, el test del límite por token chocaría con el de IP.
let ipSeq = 0;
function req(
  token: string,
  { transport = "mcp", ip, ua }: { transport?: string; ip?: string; ua?: string } = {},
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": `${ip ?? `10.0.0.${++ipSeq}`}, 1.1.1.1`,
  };
  if (ua) headers["user-agent"] = ua;
  return new Request(`https://a/api/mcp/${token}/${transport}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
}

describe("POST /api/mcp/[token]/[transport]", () => {
  beforeEach(() => {
    createMcpHandler.mockClear();
    registros.length = 0;
    opciones.length = 0;
    resultados.length = 0;
    correrTool.value = false;
    pendiente.value = Promise.resolve();
    verifyMcpToken.mockClear();
    touchClaudeLink.mockClear();
    toolHandler.mockClear();
    toolHandler.mockResolvedValue("texto de la tool");
  });

  it("token inválido → 404 (no 401: no confirma que el endpoint exista) y no delega", async () => {
    const res = await POST(req("malo"), ctx("malo"));
    expect(res.status).toBe(404);
    expect(createMcpHandler).not.toHaveBeenCalled();
  });

  it("transport que no es mcp → 404 sin siquiera verificar el token", async () => {
    const res = await POST(req("ok-t", { transport: "sse" }), ctx("ok-t", "sse"));
    expect(res.status).toBe(404);
    expect(verifyMcpToken).not.toHaveBeenCalled();
    expect(createMcpHandler).not.toHaveBeenCalled();
  });

  it("token válido → delega en mcp-handler y registra las tools del proyecto resuelto", async () => {
    const res = await POST(req("ok-a"), ctx("ok-a"));
    expect(res.status).toBe(200);
    expect(createMcpHandler).toHaveBeenCalledTimes(1);
    expect(registros[0].map((t) => t.name)).toEqual(["get_brief"]);
    expect(registros[0][0].config.description).toBe("Brief de p1");
  });

  it("crea un handler NUEVO por request: el projectId vive en el closure", async () => {
    await POST(req("ok-b"), ctx("ok-b"));
    await POST(req("ok-c"), ctx("ok-c"));
    expect(createMcpHandler).toHaveBeenCalledTimes(2);
  });

  it("GET y DELETE comparten el mismo camino de verificación", async () => {
    expect((await GET(req("malo"), ctx("malo"))).status).toBe(404);
    expect((await DELETE(req("malo"), ctx("malo"))).status).toBe(404);
  });

  it("sin tool ejecutada no se toca el vínculo (initialize y tools/list no son uso)", async () => {
    await POST(req("ok-d"), ctx("ok-d"));
    expect(touchClaudeLink).not.toHaveBeenCalled();
  });

  it("envoltorio MCP: { content: [{ type: 'text', text }] } y marca actividad con el cliente", async () => {
    correrTool.value = true;
    await POST(req("ok-e"), ctx("ok-e"));
    await pendiente.value;
    expect(resultados[0]).toEqual({ content: [{ type: "text", text: "texto de la tool" }] });
    expect(touchClaudeLink).toHaveBeenCalledWith("p1", "claude-ai 1.0");
  });

  it("la telemetría se agenda DESDE la tool, no después del handler (el SSE vuelve antes)", async () => {
    correrTool.value = true;
    const res = await POST(req("ok-g"), ctx("ok-g"));
    expect(res.status).toBe(200);
    // El handler ya devolvió y la tool todavía no corrió: cualquier cosa
    // agendada después de `await handler(req)` no vería nunca la llamada.
    expect(touchClaudeLink).not.toHaveBeenCalled();
    await pendiente.value;
    expect(touchClaudeLink).toHaveBeenCalledTimes(1);
  });

  it("el user-agent gana como nombre de cliente (en tools/call no hubo initialize)", async () => {
    correrTool.value = true;
    await POST(req("ok-ua", { ua: "claude-user/1.2 (chrome)" }), ctx("ok-ua"));
    await pendiente.value;
    expect(touchClaudeLink).toHaveBeenCalledWith("p1", "claude-user/1.2 (chrome)");
  });

  it("user-agent larguísimo → recortado a 80 chars", async () => {
    correrTool.value = true;
    await POST(req("ok-ua2", { ua: "x".repeat(200) }), ctx("ok-ua2"));
    await pendiente.value;
    expect(touchClaudeLink).toHaveBeenCalledWith("p1", "x".repeat(80));
  });

  it("una tool que tira devuelve isError con el mensaje, no un 500", async () => {
    correrTool.value = true;
    toolHandler.mockRejectedValueOnce(new Error("boom"));
    const res = await POST(req("ok-f"), ctx("ok-f"));
    expect(res.status).toBe(200);
    await pendiente.value;
    expect(resultados[0].isError).toBe(true);
    expect(resultados[0].content[0].text).toContain("boom");
  });

  it("mensaje de error larguísimo → recortado a 300 chars", async () => {
    correrTool.value = true;
    toolHandler.mockRejectedValueOnce(new Error("z".repeat(1000)));
    await POST(req("ok-f2"), ctx("ok-f2"));
    await pendiente.value;
    expect(resultados[0].content[0].text).toBe(`Error: ${"z".repeat(300)}`);
  });

  it("throw que no es Error → mensaje genérico, sin filtrar el objeto crudo", async () => {
    correrTool.value = true;
    toolHandler.mockImplementationOnce(async () => {
      throw { secreto: "no mostrar" };
    });
    await POST(req("ok-f3"), ctx("ok-f3"));
    await pendiente.value;
    expect(resultados[0].content[0].text).toBe("Error: error interno");
    expect(resultados[0].isError).toBe(true);
  });

  it("onEvent traduce los errores de protocolo del adapter a un log.warn", async () => {
    await POST(req("ok-ev"), ctx("ok-ev"));
    const onEvent = opciones[0].onEvent as (e: unknown) => void;
    expect(typeof onEvent).toBe("function");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    onEvent({ type: "REQUEST_RECEIVED", method: "tools/list", status: "success" });
    expect(warn).not.toHaveBeenCalled();
    onEvent({
      type: "ERROR",
      error: new Error("accept incompleto"),
      source: "request",
      severity: "error",
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("mcp.protocol_error");
    expect(String(warn.mock.calls[0][0])).toContain("accept incompleto");
    warn.mockRestore();
  });

  it("supera el rate limit por token → 429 con Retry-After", async () => {
    for (let i = 0; i < RATE_LIMIT; i++) {
      expect((await POST(req("ok-rl"), ctx("ok-rl"))).status).toBe(200);
    }
    const res = await POST(req("ok-rl"), ctx("ok-rl"));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("supera el rate limit por IP → 429 antes de verificar el token", async () => {
    const ip = "203.0.113.9";
    for (let i = 0; i < RATE_LIMIT; i++) {
      expect((await POST(req(`ok-ip-${i}`, { ip }), ctx(`ok-ip-${i}`))).status).toBe(200);
    }
    verifyMcpToken.mockClear();
    const res = await POST(req("ok-ip-x", { ip }), ctx("ok-ip-x"));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(verifyMcpToken).not.toHaveBeenCalled();
  });
});

describe("rateLimitOk", () => {
  it("deja pasar RATE_LIMIT por ventana y corta la siguiente", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < RATE_LIMIT; i++) expect(rateLimitOk("k1", t0)).toBe(true);
    expect(rateLimitOk("k1", t0)).toBe(false);
  });

  it("la ventana siguiente arranca de cero", () => {
    const t0 = 2_000_000;
    for (let i = 0; i < RATE_LIMIT; i++) rateLimitOk("k2", t0);
    expect(rateLimitOk("k2", t0)).toBe(false);
    expect(rateLimitOk("k2", t0 + 60_001)).toBe(true);
  });

  it("cada token tiene su propio balde", () => {
    const t0 = 3_000_000;
    for (let i = 0; i < RATE_LIMIT; i++) rateLimitOk("k3", t0);
    expect(rateLimitOk("k3", t0)).toBe(false);
    expect(rateLimitOk("k4", t0)).toBe(true);
  });
});
