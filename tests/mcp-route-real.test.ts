// Contrato con mcp-handler DE VERDAD: acá no se mockea ni el adapter ni el SDK.
// tests/mcp-route.test.ts prueba la lógica de la ruta con un doble; este prueba
// lo que el doble no puede saber — que un POST como el que manda claude.ai
// (protocolo 2025-06-18, Accept con json + event-stream) atraviesa la ruta, que
// GET/DELETE los rechaza la librería con 405, y que la respuesta de tools/call
// viaja por un stream SSE que se completa DESPUÉS de que el handler devolvió.
//
// Solo se mockean los bordes propios: token, vínculo y tools.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const { touchClaudeLink, pingHandler } = vi.hoisted(() => ({
  touchClaudeLink: vi.fn(async () => {}),
  pingHandler: vi.fn(async () => "pong"),
}));

vi.mock("@/lib/mcp-token", () => ({
  verifyMcpToken: async (t: string | null) => (t === "tok-ok" ? "p1" : null),
}));
vi.mock("@/lib/claude-link", () => ({ touchClaudeLink }));
vi.mock("@/lib/mcp/tools", () => ({
  TOOL_NAMES: ["ping"],
  makeTools: () => [
    {
      name: "ping",
      title: "Ping",
      description: "Devuelve pong",
      inputSchema: z.object({}),
      handler: pingHandler,
    },
  ],
}));
// `after` fuera de un request de Next tira: acá la telemetría corre en el acto.
vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }));

import { GET, POST } from "@/app/api/mcp/[token]/[transport]/route";

const UA = "claude-ai/2.1 (test)";
const ctx = (token = "tok-ok") => ({ params: Promise.resolve({ token, transport: "mcp" }) });

// Los conectores de claude.ai mandan las dos cosas en Accept; el transporte
// Streamable HTTP rechaza el POST si falta cualquiera de las dos.
let ipSeq = 0;
function post(body: unknown, token = "tok-ok") {
  return new Request(`https://a/api/mcp/${token}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "user-agent": UA,
      "x-forwarded-for": `198.51.100.${++ipSeq}`,
    },
    body: JSON.stringify(body),
  });
}

const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "claude-ai", version: "2.1" },
  },
};

describe("ruta MCP contra el mcp-handler real", () => {
  beforeEach(() => {
    touchClaudeLink.mockClear();
    pingHandler.mockClear();
  });

  it("POST initialize (2025-06-18) → 200 y no marca actividad (el handshake no es uso)", async () => {
    const res = await POST(post(initialize), ctx());
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("tronador");
    expect(touchClaudeLink).not.toHaveBeenCalled();
  });

  it("GET → 405: el leg stateless no tiene sesión que reabrir", async () => {
    const req = new Request("https://a/api/mcp/tok-ok/mcp", {
      method: "GET",
      headers: { accept: "text/event-stream", "x-forwarded-for": `198.51.100.${++ipSeq}` },
    });
    const res = await GET(req, ctx());
    expect(res.status).toBe(405);
  });

  it("token inválido → 404 sin tocar la librería", async () => {
    const res = await POST(post(initialize, "tok-malo"), ctx("tok-malo"));
    expect(res.status).toBe(404);
  });

  it("POST tools/call → el stream SSE trae el resultado y marca actividad con el user-agent", async () => {
    const res = await POST(
      post({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "ping", arguments: {} } }),
      ctx(),
    );
    expect(res.status).toBe(200);
    // Leer el body hasta el final es lo que espera a que la tool corra: el
    // Response vuelve antes, con el stream todavía abierto.
    const body = await res.text();
    expect(body).toContain("pong");
    expect(pingHandler).toHaveBeenCalledTimes(1);
    expect(touchClaudeLink).toHaveBeenCalledWith("p1", UA);
  });
});
