// Servidor MCP remoto por proyecto (Streamable HTTP, mcp-handler 2.x).
//
// El token va EN EL PATH porque los conectores personalizados de claude.ai no
// permiten cabeceras propias y OAuth queda fuera de alcance. Consecuencias que
// esta ruta implementa:
//   1. Se verifica ANTES de delegar. Token que no valida → 404, nunca 401: un
//      401 confirmaría que el endpoint existe para ese proyecto.
//   2. La aplicación jamás loguea la URL completa (tokenTag deja solo el
//      prefijo), pero el path queda en los logs de acceso de la plataforma
//      (riesgo residual, mitigado por rotación).
//   3. Rate limit barato por IP ANTES de tocar la base (un token inválido no
//      debería costar una lectura por request) y 60 req/min por token después.
//
// El handler se construye DENTRO de la función de request, no a nivel de
// módulo: el ALCANCE sale del token y viaja por el closure de makeTools() —
// un proyecto fijo (conector clásico) o una cuenta que resuelve el proyecto
// por membresía en cada llamada (conector multiproyecto). Es además el patrón
// oficial de mcp-handler para rutas dinámicas (createMcpHandler(...)(req) por
// request); el costo es un McpServer por request, que el adapter iba a crear
// igual porque sirve stateless.
//
// mcp-handler 2.x no mira el pathname, así que el segmento [transport] es
// decorativo: existe para que la URL sea la que documenta la spec
// (…/api/mcp/<token>/mcp). Cualquier otro valor devuelve 404.
import { after } from "next/server";
import { createMcpHandler, type McpHandlerOptions } from "mcp-handler";
import type { McpServer } from "@modelcontextprotocol/server";
import { verifyMcpScope } from "@/lib/mcp-token";
import { touchClaudeLink } from "@/lib/claude-link";
import { makeTools } from "@/lib/mcp/tools";
import { rateLimitOk } from "@/lib/mcp/rate-limit";
import { log, tokenTag } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// El leg stateless de mcp-handler devuelve un stream SSE que sigue abierto
// hasta que la tool contesta: la request dura lo que dura la tool, no lo que
// tarda en volver el Response. save_report importa, arma el PDF y manda mail;
// con el default de Vercel la conexión se corta a mitad de camino.
export const maxDuration = 300;

// Mensaje de error de tool: lo ve el modelo, no un humano, y viaja en cada
// respuesta. 300 chars alcanzan para diagnosticar sin volcar un stack entero
// (ni, por accidente, un payload con datos del proyecto) en la conversación.
const MAX_ERROR_CHARS = 300;
// El user-agent es texto que manda el cliente: se recorta antes de guardarlo.
const MAX_CLIENT_CHARS = 80;

const notFound = () => new Response("Not found", { status: 404 });

// Primera IP de x-forwarded-for: las que siguen las agregó un proxy intermedio
// y el cliente puede inventarlas. Sin la cabecera (local, tests) el balde es
// compartido, que es exactamente lo que queremos en ese caso.
function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0]?.trim() || "sin-ip";
}

function userAgent(req: Request): string | null {
  const ua = req.headers.get("user-agent")?.trim();
  return ua ? ua.slice(0, MAX_CLIENT_CHARS) : null;
}

// getClientVersion() está marcado @deprecated en el SDK v2, pero es la única
// vía tipada: la alternativa (ctx.mcpReq.envelope) viene declarada como {} por
// un bug del .d.ts de @modelcontextprotocol/server@2.0.0. Además, en el leg
// legacy stateless (el que usan hoy los clientes de claude.ai, protocolo
// 2025-06-18) cada POST arma un McpServer nuevo: en el POST de tools/call no
// hubo initialize contra ESE server, así que la info del cliente viene vacía.
// Por eso el user-agent manda y esto queda de fallback.
function clientName(server: McpServer): string | null {
  try {
    const info = (
      server as unknown as {
        server?: { getClientVersion?: () => { name?: string; version?: string } | undefined };
      }
    ).server?.getClientVersion?.();
    if (!info?.name) return null;
    return `${info.name}${info.version ? ` ${info.version}` : ""}`.slice(0, MAX_CLIENT_CHARS);
  } catch {
    return null;
  }
}

type McpEvent = Parameters<NonNullable<McpHandlerOptions["onEvent"]>>[0];

async function handle(
  req: Request,
  ctx: { params: Promise<{ token: string; transport: string }> },
): Promise<Response> {
  const { token, transport } = await ctx.params;
  if (transport !== "mcp") return notFound();

  const tooMany = () =>
    new Response("Too Many Requests", { status: 429, headers: { "Retry-After": "60" } });

  // Antes de verifyMcpToken: verificar cuesta una lectura de conector_config y
  // un hash, y un bucle contra tokens inválidos no debería pagarla.
  if (!rateLimitOk(`ip:${clientIp(req)}`)) {
    log.warn("mcp.rate_limited", { scope: "ip" });
    return tooMany();
  }

  const scope = await verifyMcpScope(token);
  if (!scope) {
    log.warn("mcp.token_invalid", { token: tokenTag(token) });
    return notFound();
  }
  // Para logs: el projectId identifica al conector de proyecto; el de cuenta
  // se identifica por el tag del token (el email no va a logs).
  const scopeTag: Record<string, string> =
    scope.kind === "project"
      ? { projectId: scope.projectId }
      : { account: tokenTag(token) };
  if (!rateLimitOk(token)) {
    log.warn("mcp.rate_limited", { scope: "token", ...scopeTag });
    return tooMany();
  }

  const ua = userAgent(req);

  const handler = createMcpHandler(
    (server: McpServer) => {
      // Telemetría del vínculo fuera del camino crítico. makeTools la invoca
      // DESDE la tool en ejecución (con el proyecto ya resuelto: en alcance
      // cuenta cambia por llamada) y no después de `await handler(req)`,
      // porque el leg stateless despacha el mensaje sin esperarlo y devuelve
      // el Response SSE antes de que la tool corra: afuera nunca veríamos que
      // hubo una llamada. Desde la tool, además, es lo único que distingue
      // uso real de handshake (initialize y tools/list llegan siempre).
      const onUse = (usedProjectId: string) =>
        after(() => touchClaudeLink(usedProjectId, ua ?? clientName(server) ?? "desconocido"));
      for (const tool of makeTools(scope, { onUse })) {
        server.registerTool(
          tool.name,
          { title: tool.title, description: tool.description, inputSchema: tool.inputSchema },
          async (args: unknown) => {
            try {
              const text = await tool.handler((args ?? {}) as Record<string, unknown>);
              return { content: [{ type: "text" as const, text }] };
            } catch (e) {
              // Un error de tool es un resultado del protocolo, no un 500: si
              // se propaga, el cliente pierde el mensaje y ve "server error".
              const message = (
                e instanceof Error ? e.message || "error desconocido" : "error interno"
              ).slice(0, MAX_ERROR_CHARS);
              log.warn("mcp.tool_failed", { ...scopeTag, tool: tool.name, error: message });
              return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
            }
          },
        );
      }
    },
    {
      serverInfo: { name: "tronador", version: "1" },
      // Errores del adapter (JSON mal formado, Accept incompleto, transporte
      // caído). Sin esto se los come el 500 genérico y el conector queda
      // "roto" sin una sola línea de log para saber por qué.
      onEvent: (e: McpEvent) => {
        if (e?.type !== "ERROR") return;
        log.warn("mcp.protocol_error", {
          ...scopeTag,
          source: e.source,
          severity: e.severity,
          error: (e.error instanceof Error ? e.error.message : String(e.error)).slice(
            0,
            MAX_ERROR_CHARS,
          ),
        });
      },
    },
  );

  return handler(req);
}

export { handle as GET, handle as POST, handle as DELETE };
