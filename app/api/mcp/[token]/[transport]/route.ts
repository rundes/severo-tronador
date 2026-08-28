// Servidor MCP remoto por proyecto (Streamable HTTP, mcp-handler 2.x).
//
// El token va EN EL PATH porque los conectores personalizados de claude.ai no
// permiten cabeceras propias y OAuth queda fuera de alcance. Consecuencias que
// esta ruta implementa:
//   1. Se verifica ANTES de delegar. Token que no valida → 404, nunca 401: un
//      401 confirmaría que el endpoint existe para ese proyecto.
//   2. La URL completa jamás se loguea (tokenTag deja solo el prefijo).
//   3. Rate limit de 60 req/min por token.
//
// El handler se construye DENTRO de la función de request, no a nivel de
// módulo: el projectId sale del token y viaja por el closure de makeTools(),
// que es lo que permite que ninguna tool reciba projectId. Es además el patrón
// oficial de mcp-handler para rutas dinámicas (createMcpHandler(...)(req) por
// request); el costo es un McpServer por request, que el adapter iba a crear
// igual porque sirve stateless.
//
// mcp-handler 2.x no mira el pathname, así que el segmento [transport] es
// decorativo: existe para que la URL sea la que documenta la spec
// (…/api/mcp/<token>/mcp). Cualquier otro valor devuelve 404.
import { after } from "next/server";
import { createMcpHandler } from "mcp-handler";
import type { McpServer } from "@modelcontextprotocol/server";
import { verifyMcpToken } from "@/lib/mcp-token";
import { touchClaudeLink } from "@/lib/claude-link";
import { makeTools } from "@/lib/mcp/tools";
import { rateLimitOk } from "@/lib/mcp/rate-limit";
import { log, tokenTag } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404 });

// getClientVersion() está marcado @deprecated en el SDK v2, pero es la única
// vía tipada: la alternativa (ctx.mcpReq.envelope) viene declarada como {} por
// un bug del .d.ts de @modelcontextprotocol/server@2.0.0. En el protocolo
// 2026-07-28 el SDK la rellena por request desde el envelope; en el fallback
// 2025 puede venir vacía. Por eso: try/catch y "desconocido".
function clientName(server: McpServer): string | null {
  try {
    const info = (
      server as unknown as {
        server?: { getClientVersion?: () => { name?: string; version?: string } | undefined };
      }
    ).server?.getClientVersion?.();
    if (!info?.name) return null;
    return `${info.name}${info.version ? ` ${info.version}` : ""}`.slice(0, 80);
  } catch {
    return null;
  }
}

async function handle(
  req: Request,
  ctx: { params: Promise<{ token: string; transport: string }> },
): Promise<Response> {
  const { token, transport } = await ctx.params;
  if (transport !== "mcp") return notFound();

  const projectId = await verifyMcpToken(token);
  if (!projectId) {
    log.warn("mcp.token_invalid", { token: tokenTag(token) });
    return notFound();
  }
  if (!rateLimitOk(token)) {
    log.warn("mcp.rate_limited", { projectId });
    return new Response("Too Many Requests", { status: 429, headers: { "Retry-After": "60" } });
  }

  let client = "desconocido";
  let toolCalled = false;

  const handler = createMcpHandler(
    (server: McpServer) => {
      for (const tool of makeTools(projectId)) {
        server.registerTool(
          tool.name,
          { title: tool.title, description: tool.description, inputSchema: tool.inputSchema },
          async (args: unknown) => {
            toolCalled = true;
            client = clientName(server) ?? client;
            try {
              const text = await tool.handler((args ?? {}) as Record<string, unknown>);
              return { content: [{ type: "text" as const, text }] };
            } catch (e) {
              // Un error de tool es un resultado del protocolo, no un 500: si
              // se propaga, el cliente pierde el mensaje y ve "server error".
              const message = (e as Error).message || "error desconocido";
              log.warn("mcp.tool_failed", { projectId, tool: tool.name, error: message });
              return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
            }
          },
        );
      }
    },
    { serverInfo: { name: "tronador", version: "1" } },
  );

  const res = await handler(req);
  // Telemetría del vínculo fuera del camino crítico, y solo si corrió una
  // tool: initialize y tools/list llegan en cada handshake y no son "uso".
  if (toolCalled) after(() => touchClaudeLink(projectId, client));
  return res;
}

export { handle as GET, handle as POST, handle as DELETE };
