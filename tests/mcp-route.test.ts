import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted: los factories de vi.mock se izan por encima de los `const` del
// archivo, así que todo lo que un factory referencia tiene que declararse acá
// (mismo patrón que tests/extension-candidates-route.test.ts).
const { createMcpHandler, registros, resultados, correrTool, verifyMcpToken, touchClaudeLink, toolHandler } = vi.hoisted(() => {
  type Resultado = { content: { type: string; text: string }[]; isError?: boolean };
  interface Registro {
    name: string;
    config: Record<string, unknown>;
    cb: (args: unknown) => Promise<Resultado>;
  }
  const registros: Registro[][] = [];
  const resultados: Resultado[] = [];
  // Si el request "ejecuta una tool" o no. Importa porque la ruta solo marca
  // actividad en el vínculo cuando corrió una tool: initialize y tools/list no
  // son uso, y hay que ejercer el callback ADENTRO del handler para que el
  // orden sea el real (cb primero, `after` después).
  const correrTool = { value: false };
  const toolHandler = vi.fn(async () => "texto de la tool");
  // El handler real de mcp-handler no se ejerce acá: lo que importa es que la
  // ruta NO delegue si el token no vale, que cuando delega registre las tools
  // del proyecto resuelto, y que el envoltorio del protocolo sea el correcto.
  const createMcpHandler = vi.fn((init: (server: unknown) => void) => {
    const lote: Registro[] = [];
    init({
      registerTool: (name: string, config: Record<string, unknown>, cb: Registro["cb"]) => {
        lote.push({ name, config, cb });
      },
      server: { getClientVersion: () => ({ name: "claude-ai", version: "1.0" }) },
    });
    registros.push(lote);
    return async () => {
      if (correrTool.value) resultados.push(await lote[0].cb({}));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
  });
  return {
    createMcpHandler,
    registros,
    resultados,
    correrTool,
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
const req = (token: string, transport = "mcp") =>
  new Request(`https://a/api/mcp/${token}/${transport}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });

describe("POST /api/mcp/[token]/[transport]", () => {
  beforeEach(() => {
    createMcpHandler.mockClear();
    registros.length = 0;
    resultados.length = 0;
    correrTool.value = false;
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
    const res = await POST(req("ok-t", "sse"), ctx("ok-t", "sse"));
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

  it("envoltorio MCP: { content: [{ type: 'text', text }] } y marca actividad con el cliente del handshake", async () => {
    correrTool.value = true;
    await POST(req("ok-e"), ctx("ok-e"));
    expect(resultados[0]).toEqual({ content: [{ type: "text", text: "texto de la tool" }] });
    expect(touchClaudeLink).toHaveBeenCalledWith("p1", "claude-ai 1.0");
  });

  it("una tool que tira devuelve isError con el mensaje, no un 500", async () => {
    correrTool.value = true;
    toolHandler.mockRejectedValueOnce(new Error("boom"));
    const res = await POST(req("ok-f"), ctx("ok-f"));
    expect(res.status).toBe(200);
    expect(resultados[0].isError).toBe(true);
    expect(resultados[0].content[0].text).toContain("boom");
  });

  it("supera el rate limit → 429 con Retry-After", async () => {
    for (let i = 0; i < RATE_LIMIT; i++) {
      expect((await POST(req("ok-rl"), ctx("ok-rl"))).status).toBe(200);
    }
    const res = await POST(req("ok-rl"), ctx("ok-rl"));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
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
