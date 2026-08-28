# Vínculo con Claude (MCP remoto por proyecto) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Tronador sea la memoria de las sesiones de Claude: un servidor MCP remoto por proyecto (`https://<app>/api/mcp/<token>/mcp`) que expone brief, métricas, menciones, corridas e informes, acepta propuestas de brief y —sobre todo— **importa** el informe que el operador arma a mano con Claude in Chrome (Markdown o el HTML del 26/08) al historial, con mail + PDF y propuestas de brief pendientes. Más el vínculo con la conversación de claude.ai y la tarjeta del panel para operarlo todo.

**Architecture:** El token `<projectId>.<secreto>` viaja **en el path** (`lib/mcp-token.ts`, fila sintética `conector_config` `mcp-token:<pid>`, solo SHA-256 guardado) porque los conectores personalizados de claude.ai no permiten cabeceras propias. La ruta `app/api/mcp/[token]/[transport]/route.ts` **verifica el token ANTES de delegar** (404 si no valida, nunca 401: no confirma que el endpoint exista), aplica un rate limit de 60 req/min por token (`lib/mcp/rate-limit.ts`) y recién entonces construye el handler de `mcp-handler` **dentro de la función de request**, con el `projectId` resuelto capturado en un closure — es la única forma de que las tools no reciban `projectId` (y es el patrón oficial de `mcp-handler` para rutas dinámicas: `createMcpHandler(...)(req)` por request). Las 10 tools viven en `lib/mcp/tools.ts` como funciones puras que devuelven **texto** (`makeTools(projectId)`), sin importar nada del SDK: el envoltorio `{ content: [{ type: "text", text }] }` lo pone la ruta, así que los tests las llaman directo. La importación (`lib/report-import.ts`) convierte HTML→Markdown con `turndown` + `turndown-plugin-gfm` y reglas propias para el informe de referencia, pasa por `splitReport` + `withCountdown` + `parseReportMarkdown` y guarda un `DailyReport` con los campos nuevos `origen`/`titulo`/`conversationUrl`. El vínculo con la conversación vive en `conector_config` `claude-link:<pid>` (`lib/claude-link.ts`) y se refresca en cada llamada con el `clientInfo` del handshake. Sin DDL.

**Tech Stack:** Next.js 16.2 (App Router, route handlers, server actions), React 19 RSC, `mcp-handler` 2.1.1 + `@modelcontextprotocol/server` 2.0.0 (MCP SDK v2), zod v4, `turndown` 7.2 + `turndown-plugin-gfm` 1.0, Supabase (`conector_config`), vitest.

**Spec:** `docs/superpowers/specs/2026-08-28-mcp-claude-chrome-design.md`

---

## Convenciones

- Tests: `npx vitest run <archivo>`; suite: `npx vitest run`; tipos: `npx tsc --noEmit`; lint: `npx eslint <archivos>`.
- vitest incluye `tests/**/*.test.ts` con `environment: "node"`; alias `@` → raíz del repo.
- **Commits SIEMPRE con pathspec**: `git add -- <archivos> && git commit -m "…" -- <archivos>`; trailers `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01XW7g7dSqmfsaVwruSZ87N8` (se pasan con un segundo `-m`).
- Persistencia sin DDL: filas sintéticas de `conector_config` vía `upsertConectorConfig` (`lib/db/conector-config.ts`), siempre con `project_id` NULL y el proyecto adentro del `connector_id`.
- **Las dependencias YA ESTÁN en `package.json` e instaladas**: `mcp-handler ^2.1.1`, `@modelcontextprotocol/server ^2.0.0`, `turndown ^7.2.4`, `turndown-plugin-gfm ^1.0.2`, `@types/turndown ^5.0.6`, `zod ^4.4.3`. **No hay que correr `npm install` ni tocar `package.json`.** Verificar con `ls node_modules/mcp-handler` si hiciera falta.
- **`mcp-handler` 2.x NO es 1.x.** Verificado contra `node_modules/mcp-handler/dist/index.d.ts` y su README:
  - Firma: `createMcpHandler(initializeServer, options?)` — **dos** argumentos. `options` es `ServerOptions & { serverInfo?, verboseLogs?, onEvent?, maxSubscriptions? }`.
  - **No existen** `basePath`, `disableSse`, `redisUrl`, `maxDuration`, `streamableHttpEndpoint`, `sseEndpoint`, `sseMessageEndpoint`, `sessionIdGenerator`. Fueron removidos en 2.x. El handler **no mira el pathname**: se monta en la ruta que uno quiera y listo. No hay Redis ni SSE.
  - Devuelve `(request: Request) => Promise<Response>` — **un solo parámetro**, no recibe `ctx` ni params de ruta.
  - `server.registerTool(name, { title?, description?, inputSchema }, cb)` donde **`inputSchema` es un schema completo `z.object({...})`**, no un raw shape. `server.tool(...)` no existe en v2.
  - El callback devuelve `{ content: [{ type: "text", text }] }`; error = agregar `isError: true`.
  - `clientInfo`: `server.server.getClientVersion()` → `{ name, version, ... } | undefined`. Está marcado `@deprecated` pero **funciona** y en el protocolo 2026-07-28 se rellena por request desde el envelope. La alternativa no deprecada (`ctx.mcpReq.envelope`) está tipada como `{}` por un bug del `.d.ts` de `@modelcontextprotocol/server@2.0.0`, así que no compila sin cast. **Usamos `getClientVersion()` envuelto en try/catch, con fallback `"desconocido"`.**
- El segmento `[transport]` queda en la ruta (la spec y el conector de claude.ai usan la URL terminada en `/mcp`), pero en 2.x es **decorativo**: la ruta valida `transport === "mcp"` y devuelve 404 para cualquier otro valor.
- **Regla RSC**: un archivo con `"use client"` NO puede exportar nada que no sea componente si un server component lo importa. Los pedazos interactivos van en archivos `"use client"` propios que exportan **solo** el componente.

## Paralelismo

- **Task 1** (`lib/mcp-token.ts` + `lib/claude-link.ts`) y **Task 2** (`lib/report-import.ts` + campos de `DailyReport`) son independientes: **en paralelo**.
- **Task 3** (`lib/mcp/tools.ts`) necesita 1 y 2 (importa `readClaudeLink`, `importReport`).
- **Task 4** (ruta + rate limit + middleware) después de 3.
- **Task 5** (panel + actions) necesita 1 y 2; corre **en paralelo con 3 y 4**.
- **Task 6** (deploy + smoke) al final, con todo mergeado.

## File Structure

| Archivo | Acción | Responsabilidad |
| --- | --- | --- |
| `lib/mcp-token.ts` | crear | `issueMcpToken`, `verifyMcpToken`, `rotateMcpToken`, `mcpUrl` |
| `lib/claude-link.ts` | crear | `ClaudeLink`, `isClaudeConversationUrl`, `readClaudeLink`, `saveClaudeLink`, `touchClaudeLink` |
| `types/turndown-plugin-gfm.d.ts` | crear | tipos mínimos del plugin (no trae `.d.ts`) |
| `lib/report-import.ts` | crear | `htmlToMarkdown`, `importReport`, `MAX_IMPORT_CHARS` |
| `lib/daily-report.ts` | modificar | `DailyReport.origen/titulo/conversationUrl`; exportar `saveReport`; marcar `origen: "tronador"` |
| `lib/mcp/tools.ts` | crear | `makeTools(projectId)` — las 10 tools como handlers puros |
| `lib/mcp/rate-limit.ts` | crear | `rateLimitOk` (token bucket en memoria, 60/min) |
| `app/api/mcp/[token]/[transport]/route.ts` | crear | verificación del token → 404, rate limit → 429, handler por request |
| `middleware.ts` | modificar | excluir `api/mcp` del gate de sesión |
| `components/escucha/claude-link-card.tsx` | crear | tarjeta "Claude" (server component) |
| `components/escucha/mcp-url-button.tsx` | crear | `"use client"`, muestra la URL una sola vez |
| `components/escucha/informe-panel.tsx` | modificar | tarjeta Claude + badge de origen + link a la conversación |
| `app/(dashboard)/escucha/page.tsx` | modificar | pasar `claude` y `params` al panel |
| `app/(dashboard)/escucha/actions.ts` | modificar | `generarUrlMcp`, `vincularConversacion`, `importarInforme` |
| `tests/fixtures/informe-ferro.html` | crear | fixture recortada del informe de referencia |
| `tests/mcp-token.test.ts` | crear | emitir / verificar / rotar |
| `tests/claude-link.test.ts` | crear | validación de URL, read/save/touch |
| `tests/report-import.test.ts` | crear | HTML → Markdown y `importReport` |
| `tests/mcp-tools.test.ts` | crear | las 10 tools con libs mockeadas |
| `tests/mcp-route.test.ts` | crear | 404 / 429 / delegación (mock de `mcp-handler`) |
| `tests/escucha-claude-actions.test.ts` | crear | `vincularConversacion`, `importarInforme`, `generarUrlMcp` |

---

### Task 1: `lib/mcp-token.ts` + `lib/claude-link.ts` + tests

**Files:** Create `lib/mcp-token.ts`, `lib/claude-link.ts`; Test `tests/mcp-token.test.ts`, `tests/claude-link.test.ts`

- [ ] **Step 1: Tests que fallan**

```ts
// tests/mcp-token.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mismo patrón que tests/extension-token.test.ts: el token vive en una fila
// sintética de conector_config con project_id NULL, así que el upsert declara
// el conflicto sobre (connector_id, project_id) o Postgres tira 42P10.
const upsert = vi.fn().mockResolvedValue({ error: null });
const maybeSingle = vi.fn();
vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => true,
  getSupabase: () => ({
    from: () => ({
      upsert,
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }),
  }),
}));

import { issueMcpToken, verifyMcpToken, rotateMcpToken, mcpUrl } from "@/lib/mcp-token";

const PID = "b06f7ba4-3e3e-4392-bde9-a0df600f3cf2";

describe("mcp-token", () => {
  beforeEach(() => {
    upsert.mockClear();
    maybeSingle.mockReset();
  });

  it("issue: guarda solo el hash en mcp-token:<pid> con project_id null", async () => {
    const token = await issueMcpToken(PID);
    expect(token.startsWith(`${PID}.`)).toBe(true);
    expect(token.slice(PID.length + 1)).toMatch(/^[0-9a-f]{48}$/);
    expect(upsert).toHaveBeenCalledTimes(1);
    const [row, opts] = upsert.mock.calls[0];
    expect(row.connector_id).toBe(`mcp-token:${PID}`);
    expect(row.project_id).toBeNull();
    expect(opts.onConflict).toBe("connector_id,project_id");
    // El plaintext NUNCA se guarda: solo su sha256.
    expect(JSON.stringify(row.config)).not.toContain(token.slice(PID.length + 1));
    expect(row.config.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("issue: propaga el error de la DB en vez de tragarlo", async () => {
    upsert.mockResolvedValueOnce({ error: { code: "42P10", message: "no unique" } });
    await expect(issueMcpToken(PID)).rejects.toMatchObject({ code: "42P10" });
  });

  it("verify: acepta el token recién emitido y rechaza cualquier otro", async () => {
    const token = await issueMcpToken(PID);
    const storedHash = upsert.mock.calls[0][0].config.hash;
    maybeSingle.mockResolvedValue({ data: { config: { hash: storedHash } } });
    expect(await verifyMcpToken(token)).toBe(PID);
    expect(await verifyMcpToken(`${PID}.${"0".repeat(48)}`)).toBeNull();
  });

  it("verify: formato inválido → null sin tocar la DB", async () => {
    for (const bad of ["", "garbage", "sin-punto", `${PID}.corto`, `.${"a".repeat(48)}`, "no-uuid.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]) {
      expect(await verifyMcpToken(bad)).toBeNull();
    }
    expect(await verifyMcpToken(null)).toBeNull();
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it("verify: sin fila guardada → null", async () => {
    maybeSingle.mockResolvedValue({ data: null });
    expect(await verifyMcpToken(`${PID}.${"a".repeat(48)}`)).toBeNull();
  });

  it("rotate: emite uno nuevo y el anterior deja de valer", async () => {
    const viejo = await issueMcpToken(PID);
    const nuevo = await rotateMcpToken(PID);
    expect(nuevo).not.toBe(viejo);
    const hashNuevo = upsert.mock.calls[1][0].config.hash;
    maybeSingle.mockResolvedValue({ data: { config: { hash: hashNuevo } } });
    expect(await verifyMcpToken(nuevo)).toBe(PID);
    expect(await verifyMcpToken(viejo)).toBeNull();
  });

  it("mcpUrl: arma la URL del conector y tolera la barra final", () => {
    expect(mcpUrl("https://app.ar", `${PID}.abc`)).toBe(`https://app.ar/api/mcp/${PID}.abc/mcp`);
    expect(mcpUrl("https://app.ar/", `${PID}.abc`)).toBe(`https://app.ar/api/mcp/${PID}.abc/mcp`);
  });
});
```

```ts
// tests/claude-link.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const upsert = vi.fn().mockResolvedValue({ error: null });
const maybeSingle = vi.fn().mockResolvedValue({ data: null });
vi.mock("@/lib/db/supabase", () => ({
  dbConfigured: () => true,
  getSupabase: () => ({
    from: () => ({
      upsert,
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }),
  }),
}));

import {
  isClaudeConversationUrl,
  readClaudeLink,
  saveClaudeLink,
  touchClaudeLink,
} from "@/lib/claude-link";

const PID = "b06f7ba4-3e3e-4392-bde9-a0df600f3cf2";

describe("isClaudeConversationUrl", () => {
  it("acepta conversaciones de claude.ai por https", () => {
    expect(isClaudeConversationUrl("https://claude.ai/chat/2f0c1f9a-6d4e-4f0b-9a1e-3c5b7d9e0a11")).toBe(true);
    expect(isClaudeConversationUrl("https://www.claude.ai/chat/abc")).toBe(true);
    expect(isClaudeConversationUrl("  https://claude.ai/recents  ")).toBe(true);
  });

  it("rechaza cualquier otro host, esquema o basura", () => {
    for (const bad of [
      "",
      "claude.ai/chat/abc",
      "http://claude.ai/chat/abc",
      "https://claude.ai.evil.com/chat/abc",
      "https://chatgpt.com/c/abc",
      "javascript:alert(1)",
      `https://claude.ai/chat/${"a".repeat(600)}`,
    ]) {
      expect(isClaudeConversationUrl(bad)).toBe(false);
    }
  });
});

describe("claude-link persistencia", () => {
  beforeEach(() => {
    upsert.mockClear();
    maybeSingle.mockReset();
    maybeSingle.mockResolvedValue({ data: null });
  });

  it("read: sin fila devuelve el vínculo vacío", async () => {
    expect(await readClaudeLink(PID)).toEqual({});
  });

  it("read: descarta campos que no son string (la fila es JSON libre)", async () => {
    maybeSingle.mockResolvedValue({
      data: { config: { conversationUrl: 42, client: "Claude in Chrome", lastToolAt: "2026-08-28T10:00:00.000Z", basura: true } },
    });
    expect(await readClaudeLink(PID)).toEqual({
      client: "Claude in Chrome",
      lastToolAt: "2026-08-28T10:00:00.000Z",
    });
  });

  it("save: escribe en claude-link:<pid> con project_id null", async () => {
    await saveClaudeLink(PID, { conversationUrl: "https://claude.ai/chat/x", linkedAt: "2026-08-28T10:00:00.000Z" });
    const [row, opts] = upsert.mock.calls[0];
    expect(row.connector_id).toBe(`claude-link:${PID}`);
    expect(row.project_id).toBeNull();
    expect(opts.onConflict).toBe("connector_id,project_id");
    expect(row.config).toEqual({ conversationUrl: "https://claude.ai/chat/x", linkedAt: "2026-08-28T10:00:00.000Z" });
  });

  it("touch: conserva la conversación y pisa lastToolAt + client", async () => {
    maybeSingle.mockResolvedValue({
      data: { config: { conversationUrl: "https://claude.ai/chat/x", linkedAt: "2026-08-01T00:00:00.000Z", client: "viejo" } },
    });
    await touchClaudeLink(PID, "Claude in Chrome 1.2", { at: "2026-08-28T12:00:00.000Z" });
    expect(upsert.mock.calls[0][0].config).toEqual({
      conversationUrl: "https://claude.ai/chat/x",
      linkedAt: "2026-08-01T00:00:00.000Z",
      client: "Claude in Chrome 1.2",
      lastToolAt: "2026-08-28T12:00:00.000Z",
    });
  });

  it("touch con report: además marca lastReportAt", async () => {
    await touchClaudeLink(PID, "Claude Code", { at: "2026-08-28T12:00:00.000Z", report: true });
    expect(upsert.mock.calls[0][0].config).toMatchObject({
      client: "Claude Code",
      lastToolAt: "2026-08-28T12:00:00.000Z",
      lastReportAt: "2026-08-28T12:00:00.000Z",
    });
  });

  it("touch: una falla de DB no explota (es telemetría, no el trabajo)", async () => {
    upsert.mockResolvedValueOnce({ error: { message: "boom" } });
    await expect(touchClaudeLink(PID, "Claude Code")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Correr los tests — tienen que fallar**

```bash
npx vitest run tests/mcp-token.test.ts tests/claude-link.test.ts
```

Falla esperada: `Failed to resolve import "@/lib/mcp-token"` y `"@/lib/claude-link"` (los módulos no existen todavía).

- [ ] **Step 3: Implementación**

```ts
// lib/mcp-token.ts
// Token del servidor MCP remoto, por proyecto. Mismo mecanismo que el de la
// extensión (lib/extension-token.ts): formato <projectId>.<secreto hex>, se
// guarda solo el SHA-256 del secreto en la fila sintética conector_config
// mcp-token:<projectId>, y el plaintext se muestra una única vez.
//
// La diferencia con la extensión es dónde viaja: los conectores personalizados
// de claude.ai no permiten cabeceras propias, así que el token va EN LA URL
// (/api/mcp/<token>/mcp). Mitigaciones: rotación desde el panel, la URL
// completa nunca se loguea (ver tokenTag en lib/logger) y rate limit por token.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { upsertConectorConfig } from "@/lib/db/conector-config";

const key = (projectId: string) => `mcp-token:${projectId}`;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function issueMcpToken(projectId: string): Promise<string> {
  if (!dbConfigured()) throw new Error("Supabase no configurado");
  const secret = randomBytes(24).toString("hex");
  // project_id va NULL a propósito: el proyecto viaja dentro del connector_id.
  await upsertConectorConfig(key(projectId), { hash: sha256(secret) });
  return `${projectId}.${secret}`;
}

// Rotar es emitir de nuevo: el upsert pisa el hash anterior, así que el token
// viejo deja de verificar en la misma operación. Existe como nombre propio
// porque en el panel el botón dice "Regenerar" y el llamador no tiene por qué
// saber que es el mismo camino.
export async function rotateMcpToken(projectId: string): Promise<string> {
  return issueMcpToken(projectId);
}

// Devuelve el projectId si el token es válido, null si no.
export async function verifyMcpToken(token: string | null): Promise<string | null> {
  if (!token || !dbConfigured()) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const projectId = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  if (!/^[0-9a-f-]{36}$/.test(projectId) || secret.length < 32) return null;
  const { data } = await getSupabase()
    .from("conector_config")
    .select("config")
    .eq("connector_id", key(projectId))
    .maybeSingle();
  const stored = (data?.config as { hash?: string } | undefined)?.hash;
  if (!stored) return null;
  const a = Buffer.from(sha256(secret));
  const b = Buffer.from(stored);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return projectId;
}

// URL completa del conector, la que el operador pega en claude.ai. El segmento
// final /mcp es el "transport": en mcp-handler 2.x el handler no mira el path,
// pero la ruta lo exige para que la URL sea la que documenta la spec.
export function mcpUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/$/, "")}/api/mcp/${token}/mcp`;
}
```

```ts
// lib/claude-link.ts
// Vínculo entre un proyecto y la conversación de claude.ai desde la que el
// operador trabaja. Se completa de dos formas: el operador pega la URL en la
// tarjeta del panel, o Claude llama link_conversation() desde la propia
// conversación. lastToolAt/client se refrescan en cada llamada MCP, así el
// panel puede decir "última llamada: hace 5 min · Claude in Chrome".
//
// Persistencia sin DDL: fila sintética conector_config claude-link:<projectId>.
import { dbConfigured, getSupabase } from "@/lib/db/supabase";
import { upsertConectorConfig } from "@/lib/db/conector-config";
import { log } from "@/lib/logger";

export interface ClaudeLink {
  conversationUrl?: string;
  linkedAt?: string; // ISO
  lastToolAt?: string; // ISO
  lastReportAt?: string; // ISO
  client?: string; // "Claude in Chrome 1.2", "claude-code 2.0", …
}

const key = (projectId: string) => `claude-link:${projectId}`;

// Una URL de conversación es una credencial débil que el operador pega a mano:
// se acepta únicamente https://claude.ai (o www). Cualquier otro host abriría
// un link de salida arbitrario desde el panel.
const MAX_URL = 500;

export function isClaudeConversationUrl(url: string): boolean {
  const t = (url ?? "").trim();
  if (!t || t.length > MAX_URL) return false;
  try {
    const u = new URL(t);
    return u.protocol === "https:" && (u.hostname === "claude.ai" || u.hostname === "www.claude.ai");
  } catch {
    return false;
  }
}

// La fila es JSON libre (la escribió otra versión del servidor o alguien a
// mano): lo que no sea string con contenido se descarta en vez de romper el
// panel.
const str = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, MAX_URL) : undefined;
};

export function normalizeLink(raw: unknown): ClaudeLink {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: ClaudeLink = {};
  const url = str(r.conversationUrl);
  if (url) out.conversationUrl = url;
  const linkedAt = str(r.linkedAt);
  if (linkedAt) out.linkedAt = linkedAt;
  const lastToolAt = str(r.lastToolAt);
  if (lastToolAt) out.lastToolAt = lastToolAt;
  const lastReportAt = str(r.lastReportAt);
  if (lastReportAt) out.lastReportAt = lastReportAt;
  const client = str(r.client);
  if (client) out.client = client.slice(0, 80);
  return out;
}

export async function readClaudeLink(projectId: string): Promise<ClaudeLink> {
  if (!dbConfigured()) return {};
  const { data } = await getSupabase()
    .from("conector_config")
    .select("config")
    .eq("connector_id", key(projectId))
    .maybeSingle();
  return normalizeLink(data?.config);
}

export async function saveClaudeLink(projectId: string, link: ClaudeLink): Promise<void> {
  await upsertConectorConfig(key(projectId), link);
}

// Marca actividad del canal MCP. Nunca lanza: es telemetría del vínculo, no
// el trabajo — si falla, la tool igual respondió.
export async function touchClaudeLink(
  projectId: string,
  client?: string,
  opts: { at?: string; report?: boolean } = {},
): Promise<void> {
  const at = opts.at ?? new Date().toISOString();
  try {
    const current = await readClaudeLink(projectId);
    const next: ClaudeLink = { ...current, lastToolAt: at };
    if (client) next.client = client.slice(0, 80);
    if (opts.report) next.lastReportAt = at;
    await saveClaudeLink(projectId, next);
  } catch (error) {
    log.warn("claude_link.touch_failed", { projectId, error: (error as Error).message });
  }
}
```

- [ ] **Step 4: Correr los tests — tienen que pasar**

```bash
npx vitest run tests/mcp-token.test.ts tests/claude-link.test.ts
npx tsc --noEmit
npx eslint lib/mcp-token.ts lib/claude-link.ts tests/mcp-token.test.ts tests/claude-link.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add -- lib/mcp-token.ts lib/claude-link.ts tests/mcp-token.test.ts tests/claude-link.test.ts && git commit -m "feat: token MCP por proyecto y vínculo con la conversación de Claude" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XW7g7dSqmfsaVwruSZ87N8" -- lib/mcp-token.ts lib/claude-link.ts tests/mcp-token.test.ts tests/claude-link.test.ts
```

---

### Task 2: `lib/report-import.ts` (HTML→Markdown + importación) + campos de `DailyReport`

**Files:** Create `lib/report-import.ts`, `types/turndown-plugin-gfm.d.ts`, `tests/fixtures/informe-ferro.html`; Modify `lib/daily-report.ts`; Test `tests/report-import.test.ts`

- [ ] **Step 1: Fixture del informe de referencia**

Crear `tests/fixtures/informe-ferro.html` (versión recortada del `informeferro20260826.html` real: mismas clases, mismo anidado, menos filas).

```html
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Informe Ferro 26-ago-2026</title>
<style>body{font-family:system-ui}.kpis{display:flex}</style>
<script>console.log("telemetria")</script>
</head>
<body>
<script>var oculto = "no-entra";</script>
<header class="top"><div class="wrap">
 <img alt="Escudo del Club Ferro Carril Oeste" src="data:image/png;base64,AAAA">
 <div><div class="tt">Club Ferro Carril Oeste</div>
 <div class="ts">Monitoreo de redes y elecciones</div></div>
</div></header>
<div class="wrap">
<p style="font-size:13px">Mi&eacute;rcoles 26 de agosto de 2026 &middot; cierre 12:30</p>
<h1>Apareci&oacute; la primera propuesta de gobierno, y la vieron treinta personas</h1>
<p class="bajada">Ferro en Acci&oacute;n rompi&oacute; cuarenta y ocho horas de silencio con una <b>pol&iacute;tica de salud mental</b>: sac&oacute; 3 me gusta y 23 comentarios, todos de su propio c&iacute;rculo.</p>

<section id="s1">
 <h2><span class="num">01</span>El escenario</h2>
 <div class="cd">
  <div class="cdc hot"><div class="n">1</div><div class="u">d&iacute;a</div><div class="l">Grabia y Pietrafesa</div><div class="f">Jue 19 h</div></div>
  <div class="cdc"><div class="n">4</div><div class="u">d&iacute;as</div><div class="l">Estudiantes</div><div class="f">Dom 30-ago</div></div>
 </div>
 <div class="callout"><b>Por primera vez una lista propuso algo concreto, y el ecosistema no se enter&oacute;.</b> Tres me gusta contra veintitr&eacute;s comentarios.</div>
 <div class="kpis">
  <div class="kpi"><div class="k">La propuesta de salud mental</div><div class="v">3</div><div class="d">Me gusta, contra 23 comentarios.</div></div>
  <div class="kpi"><div class="k">Cuentas nuevas</div><div class="v">19</div><div class="d">Casi todas del c&iacute;rculo de un dirigente.</div></div>
 </div>
</section>

<section id="s2">
 <h2><span class="num">02</span>La primera propuesta de gobierno</h2>
 <p>El martes a las 17:29, Ferro en Acci&oacute;n public&oacute; una propuesta de <b>salud mental</b>.</p>
 <div class="tw"><table>
  <thead><tr><th>Pieza</th><th class="n">Me gusta</th><th class="n">Coment.</th></tr></thead>
  <tbody>
   <tr class="hl"><td><b>Salud mental</b> &middot; Ferro en Acci&oacute;n</td><td class="n">3</td><td class="n">23</td></tr>
   <tr><td>&laquo;Caballito te saluda&raquo; &middot; Somos Ferro</td><td class="n">600</td><td class="n">12</td></tr>
  </tbody>
 </table></div>
 <p class="scrollnote">Desliz&aacute; la tabla hacia el costado para ver todas las columnas.</p>
 <p><span class="inf">Inferencia</span>La relaci&oacute;n invertida entre me gusta y comentarios es el retrato de una organizaci&oacute;n con militancia y sin audiencia.</p>
 <p><span class="inf">Advertencia</span>La denuncia sobre sueldos impagos est&aacute; publicada y no fue desmentida.</p>
</section>

<section id="s3">
 <h2><span class="num">03</span>Si yo condujera la campa&ntilde;a</h2>
 <div class="rec"><div class="rt"><span class="pill b">Ma&ntilde;ana</span>Preparar la emisi&oacute;n como si fuera un acto</div>
 <div class="rd">Grabia y Pietrafesa en nuestro canal es la mejor oportunidad antes de septiembre.</div></div>
</section>

<section class="fuentes">
 <h2><span class="num">&nbsp;</span>Fuentes</h2>
 <ol>
  <li>Instagram &mdash; @somosferro2026, @ferroenaccion: perfiles y comentarios del 26-ago-2026.</li>
  <li>X &mdash; @DeSocios: b&uacute;squeda cronol&oacute;gica por t&eacute;rminos electorales.</li>
 </ol>
</section>
</div>
</body>
</html>
```

- [ ] **Step 2: Test que falla**

```ts
// tests/report-import.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const saveReport = vi.fn(async () => {});
const emailDailyReport = vi.fn(async () => ({ sent: 2 }));
vi.mock("@/lib/daily-report", async (orig) => ({
  ...(await orig<typeof import("@/lib/daily-report")>()),
  saveReport: (...a: unknown[]) => saveReport(...(a as [])),
  emailDailyReport: (...a: unknown[]) => emailDailyReport(...(a as [])),
}));

const items = { 1: 12, 7: 40 } as Record<number, number>;
vi.mock("@/lib/listening-cache", () => ({
  readCachedItems: async (_p: string, days: number) =>
    Array.from({ length: items[days] ?? 0 }, () => ({ source: "x", text: "t" })),
}));

let monitor = { accounts: [], searchesA: [], searchesB: [], calendar: [] as { label: string; date: string }[], noRepetir: [], budget: {}, entidades: {} };
vi.mock("@/lib/monitor-config", async (orig) => ({
  ...(await orig<typeof import("@/lib/monitor-config")>()),
  getMonitorConfig: async () => monitor,
}));

let brief: import("@/lib/client-brief").ClientBrief = { entries: [], pendingUpdates: [], suggestions: [] };
const saveClientBrief = vi.fn(async (_p: string, b: import("@/lib/client-brief").ClientBrief) => { brief = b; });
vi.mock("@/lib/client-brief", async (orig) => ({
  ...(await orig<typeof import("@/lib/client-brief")>()),
  getClientBrief: async () => brief,
  saveClientBrief: (p: string, b: typeof brief) => saveClientBrief(p, b),
}));

import { htmlToMarkdown, importReport, MAX_IMPORT_CHARS } from "@/lib/report-import";
import { parseReportMarkdown, sectionsOf, type Block } from "@/lib/report-markdown";

const FIXTURE = readFileSync(resolve(__dirname, "fixtures/informe-ferro.html"), "utf8");

describe("htmlToMarkdown · informe de referencia", () => {
  const md = htmlToMarkdown(FIXTURE);

  it("conserva el h1 y la bajada como primer párrafo después del h1", () => {
    expect(md).toContain("# Apareció la primera propuesta de gobierno, y la vieron treinta personas");
    const blocks = parseReportMarkdown(md);
    expect(blocks.some((b) => b.t === "bajada")).toBe(true);
  });

  it("mete el espacio que falta entre el número de sección y el título", () => {
    expect(md).toContain("## 01 El escenario");
    expect(md).toContain("## 02 La primera propuesta de gobierno");
    expect(md).toContain("## 03 Si yo condujera la campaña");
    // El <span class="num">&nbsp;</span> de Fuentes no deja basura.
    expect(md).toContain("## Fuentes");
    expect(md).not.toContain("## 01El escenario");
  });

  it("convierte las tarjetas .kpi en un bloque ```kpi (valor | etiqueta | nota)", () => {
    expect(md).toContain(
      "```kpi\n3 | La propuesta de salud mental | Me gusta, contra 23 comentarios.\n19 | Cuentas nuevas | Casi todas del círculo de un dirigente.\n```",
    );
    const kpi = parseReportMarkdown(md).find((b): b is Extract<Block, { t: "kpi" }> => b.t === "kpi");
    expect(kpi?.items).toEqual([
      { value: "3", label: "La propuesta de salud mental", note: "Me gusta, contra 23 comentarios." },
      { value: "19", label: "Cuentas nuevas", note: "Casi todas del círculo de un dirigente." },
    ]);
  });

  it("descarta la cuenta regresiva del HTML (la escribe el código desde los hitos)", () => {
    expect(md).not.toContain("Dom 30-ago");
    expect(md).not.toContain("```countdown");
  });

  it("etiqueta las lecturas: .inf inline y .callout de bloque", () => {
    expect(md).toContain("**Inferencia** La relación invertida entre me gusta y comentarios");
    expect(md).toContain("**Advertencia** La denuncia sobre sueldos impagos");
    expect(md).toContain("**Inferencia** **Por primera vez una lista propuso algo concreto");
    const kinds = parseReportMarkdown(md)
      .filter((b): b is Extract<Block, { t: "callout" }> => b.t === "callout")
      .map((b) => b.kind);
    expect(kinds).toEqual(["inferencia", "inferencia", "advertencia"]);
  });

  it("mantiene las tablas como tablas markdown", () => {
    const table = parseReportMarkdown(md).find((b): b is Extract<Block, { t: "table" }> => b.t === "table");
    expect(table?.header).toEqual(["Pieza", "Me gusta", "Coment."]);
    expect(table?.rows[0][2]).toBe("23");
  });

  it("separa la píldora del título de la recomendación en vez de pegarlos", () => {
    expect(md).toContain("**Mañana** · Preparar la emisión como si fuera un acto");
    expect(md).not.toContain("MañanaPreparar");
  });

  it("tira script, style, header, img y la nota de scroll", () => {
    for (const basura of ["telemetria", "no-entra", "font-family", "Monitoreo de redes y elecciones", "base64", "Deslizá la tabla"]) {
      expect(md).not.toContain(basura);
    }
  });

  it("las secciones quedan en orden y con el título limpio", () => {
    expect(sectionsOf(parseReportMarkdown(md)).map((s) => s.title).filter(Boolean)).toEqual([
      "01 El escenario",
      "02 La primera propuesta de gobierno",
      "03 Si yo condujera la campaña",
      "Fuentes",
    ]);
  });

  it("rechaza entradas por encima del límite de tamaño", () => {
    expect(() => htmlToMarkdown("<p>x</p>".repeat(MAX_IMPORT_CHARS))).toThrow(/400\.?000|400000/);
  });
});

describe("importReport", () => {
  beforeEach(() => {
    saveReport.mockClear();
    emailDailyReport.mockClear();
    emailDailyReport.mockResolvedValue({ sent: 2 });
    saveClientBrief.mockClear();
    brief = { entries: [], pendingUpdates: [], suggestions: [] };
    monitor = { ...monitor, calendar: [] };
  });

  const AT = "2026-08-26T15:30:00.000Z";

  it("markdown directo: guarda el informe con origen, título y conversación", async () => {
    const r = await importReport("p1", {
      markdown: "# Tesis del día\n\nLa bajada.\n\n## 01 El escenario\n\nTexto.\n",
      at: AT,
      origen: "claude-chrome",
      conversationUrl: "https://claude.ai/chat/x",
    });
    expect(r).toMatchObject({ at: AT, titulo: "Tesis del día", secciones: 1, briefUpdates: 0, mailSent: true });
    const [pid, report] = saveReport.mock.calls[0] as [string, import("@/lib/daily-report").DailyReport];
    expect(pid).toBe("p1");
    expect(report.origen).toBe("claude-chrome");
    expect(report.titulo).toBe("Tesis del día");
    expect(report.conversationUrl).toBe("https://claude.ai/chat/x");
    expect(report.items24h).toBe(12);
    expect(report.items7d).toBe(40);
  });

  it("HTML del informe de referencia: entra al historial con las secciones parseadas", async () => {
    const r = await importReport("p1", { html: FIXTURE, at: AT, origen: "import" });
    expect(r.titulo).toBe("Apareció la primera propuesta de gobierno, y la vieron treinta personas");
    expect(r.secciones).toBe(4);
    const [, report] = saveReport.mock.calls[0] as [string, import("@/lib/daily-report").DailyReport];
    expect(report.origen).toBe("import");
    expect(report.markdown).toContain("## 01 El escenario");
  });

  it("inserta la cuenta regresiva del código al inicio de la sección 01", async () => {
    monitor = { ...monitor, calendar: [{ label: "Elección", date: "2999-01-01" }] };
    await importReport("p1", { html: FIXTURE, at: AT, origen: "import" });
    const [, report] = saveReport.mock.calls[0] as [string, import("@/lib/daily-report").DailyReport];
    expect(report.markdown).toMatch(/## 01 El escenario\n\n```countdown\n\d+ \| Elección \| /);
  });

  it("sin h1: el título explícito se convierte en el h1", async () => {
    const r = await importReport("p1", {
      markdown: "## 01 El escenario\n\nTexto suelto.",
      titulo: "Un día sin tesis",
      at: AT,
      origen: "import",
    });
    expect(r.titulo).toBe("Un día sin tesis");
    const [, report] = saveReport.mock.calls[0] as [string, import("@/lib/daily-report").DailyReport];
    expect(report.markdown.startsWith("# Un día sin tesis")).toBe(true);
  });

  it("sin h1 ni título: la primera línea se convierte en el h1 (no se duplica)", async () => {
    const r = await importReport("p1", { markdown: "Lo que pasó hoy\n\nY después esto.", at: AT, origen: "import" });
    expect(r.titulo).toBe("Lo que pasó hoy");
    const [, report] = saveReport.mock.calls[0] as [string, import("@/lib/daily-report").DailyReport];
    expect(report.markdown).toBe("# Lo que pasó hoy\n\nY después esto.");
  });

  it("procesa el bloque ```json interno igual que el informe generado", async () => {
    const r = await importReport("p1", {
      markdown:
        "# Tesis\n\nBajada.\n\n## 01 El escenario\n\nTexto.\n\n```json\n" +
        JSON.stringify({
          briefUpdates: [{ seccion: "3.5", texto: "Cuenta nueva @identidadverdolaga" }],
          notaOperativa: "Faltan seguidores en dos cuentas.",
        }) +
        "\n```\n",
      at: AT,
      origen: "claude-chrome",
    });
    expect(r.briefUpdates).toBe(1);
    expect(brief.pendingUpdates?.[0]).toMatchObject({ seccion: "3.5", status: "pending", reportAt: AT });
    const [, report] = saveReport.mock.calls[0] as [string, import("@/lib/daily-report").DailyReport];
    expect(report.markdown).not.toContain("```json");
    expect(report.notaOperativa).toBe("Faltan seguidores en dos cuentas.");
  });

  it("suma las briefUpdates del argumento y las del json, sin duplicar", async () => {
    const r = await importReport("p1", {
      markdown: '# T\n\nB.\n\n## 01 X\n\nY.\n\n```json\n{"briefUpdates":[{"seccion":"3.5","texto":"A"}]}\n```\n',
      briefUpdates: [{ seccion: "3.5", texto: "A" }, { seccion: "4", texto: "B" }],
      at: AT,
      origen: "claude-chrome",
    });
    expect(r.briefUpdates).toBe(2);
    expect(brief.pendingUpdates?.map((u) => u.seccion)).toEqual(["3.5", "4"]);
  });

  it("enviarMail=false no manda nada y lo reporta", async () => {
    const r = await importReport("p1", { markdown: "# T\n\nB.\n\n## 01 X\n\nY.", at: AT, origen: "import", enviarMail: false });
    expect(emailDailyReport).not.toHaveBeenCalled();
    expect(r.mailSent).toBe(false);
  });

  it("si el mail falla, el informe igual queda guardado y vuelve el motivo", async () => {
    emailDailyReport.mockRejectedValueOnce(new Error("Resend 500"));
    const r = await importReport("p1", { markdown: "# T\n\nB.\n\n## 01 X\n\nY.", at: AT, origen: "import" });
    expect(saveReport).toHaveBeenCalledTimes(1);
    expect(r.mailSent).toBe(false);
    expect(r.mailError).toBe("Resend 500");
  });

  it("sin markdown ni html: error y no guarda nada", async () => {
    await expect(importReport("p1", { origen: "import" })).rejects.toThrow(/markdown|html/i);
    await expect(importReport("p1", { markdown: "   ", html: "", origen: "import" })).rejects.toThrow();
    expect(saveReport).not.toHaveBeenCalled();
  });

  it("sin ninguna sección reconocible: error y no guarda nada", async () => {
    await expect(importReport("p1", { html: "<html><body><script>x</script></body></html>", origen: "import" })).rejects.toThrow(
      /secci/i,
    );
    expect(saveReport).not.toHaveBeenCalled();
  });

  it("supera el límite de 400.000 caracteres: error y no guarda nada", async () => {
    await expect(importReport("p1", { markdown: "x".repeat(MAX_IMPORT_CHARS + 1), origen: "import" })).rejects.toThrow(
      /400\.?000|400000/,
    );
    expect(saveReport).not.toHaveBeenCalled();
  });

  it("fecha inválida: error y no guarda nada", async () => {
    await expect(importReport("p1", { markdown: "# T\n\nB.\n\n## 01 X\n\nY.", at: "ayer", origen: "import" })).rejects.toThrow(
      /fecha/i,
    );
    expect(saveReport).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Correr el test — tiene que fallar**

```bash
npx vitest run tests/report-import.test.ts
```

Falla esperada: `Failed to resolve import "@/lib/report-import"`.

- [ ] **Step 4: Implementación**

Crear `types/turndown-plugin-gfm.d.ts` (el paquete no trae tipos y `tsc` falla sin esto):

```ts
// turndown-plugin-gfm no publica .d.ts. Solo se usan `gfm` (que ya incluye
// tables) y `tables`; el resto se declara para no mentir sobre la superficie.
declare module "turndown-plugin-gfm" {
  import type TurndownService from "turndown";
  export const gfm: TurndownService.Plugin;
  export const tables: TurndownService.Plugin;
  export const strikethrough: TurndownService.Plugin;
  export const taskListItems: TurndownService.Plugin;
  export const highlightedCodeBlock: TurndownService.Plugin;
}
```

Modificar `lib/daily-report.ts` — tres cambios puntuales.

1. Agregar el import de `reportTitle` junto a los que ya están (después de `import { reportFilename } from "@/lib/report-file";`):

```ts
import { reportTitle } from "@/lib/report-markdown";
```

2. Reemplazar la interfaz `DailyReport` y la firma de `saveReport`:

```ts
export interface DailyReport {
  at: string;
  markdown: string;
  items24h: number;
  items7d: number;
  pull?: PullSummary;
  // Observación del modelo sobre la herramienta / la config / la calidad del
  // dato (cuentas en cero, handles que no coinciden con el brief, sin
  // menciones). Es para el operador, no para el informe: se muestra en el
  // panel y en el mail, nunca en el cuerpo ni en el PDF.
  notaOperativa?: string;
  // De dónde salió el informe: lo generó Tronador con la API, lo escribió el
  // operador con Claude in Chrome y entró por MCP, o se importó a mano desde
  // el panel. Ausente en los informes previos a este campo → "tronador".
  origen?: "tronador" | "claude-chrome" | "import";
  // Conversación de claude.ai desde la que se importó (si había vínculo).
  conversationUrl?: string;
  // Tesis del día ya extraída, para no re-parsear el markdown en cada listado.
  titulo?: string;
}

interface ReportStore {
  latest: DailyReport | null;
  history: DailyReport[];
}

const key = (projectId: string) => `daily-report:${projectId}`;

export async function readDailyReports(projectId: string): Promise<ReportStore> {
  if (!dbConfigured()) return { latest: null, history: [] };
  const { data } = await getSupabase()
    .from("conector_config")
    .select("config")
    .eq("connector_id", key(projectId))
    .maybeSingle();
  return (data?.config as ReportStore | undefined) ?? { latest: null, history: [] };
}

// Exportada: la importación de informes (lib/report-import.ts) guarda por el
// mismo camino que la generación, para que historial, tope y recorte del
// markdown del historial sean idénticos vengan de donde vengan.
export async function saveReport(projectId: string, report: DailyReport): Promise<void> {
  const store = await readDailyReports(projectId);
  const history = [store.latest, ...store.history]
    .filter((r): r is DailyReport => Boolean(r))
    .slice(0, HISTORY_CAP)
    // El historial no necesita el markdown completo de cada día: pesa.
    .map((r) => ({ ...r, markdown: r.markdown.slice(0, 4000), pull: undefined }));
  try {
    await upsertConectorConfig(key(projectId), { latest: report, history });
  } catch (error) {
    log.warn("daily_report.save_failed", { error: (error as Error).message });
  }
}
```

3. En `generateDailyReport`, reemplazar la construcción del `report` para que declare su origen y su título:

```ts
  const report: DailyReport = {
    at: new Date().toISOString(),
    markdown,
    items24h: items24.length,
    items7d: items7.length,
    pull,
    notaOperativa,
    origen: "tronador",
    titulo: reportTitle(markdown) ?? undefined,
  };
```

Crear `lib/report-import.ts`:

```ts
// Importación de un informe escrito afuera (Claude in Chrome, o un archivo que
// el operador pega en el panel) al historial del proyecto: mismo DailyReport,
// mismo mail con PDF, mismas propuestas de brief que el informe generado.
//
// Dos entradas: Markdown directo, o HTML. El HTML se convierte con turndown +
// turndown-plugin-gfm (tablas) más reglas propias para la maqueta del informe
// de referencia (informeferro20260826.html), que usa divs con clases en vez de
// semántica: .kpis/.kpi son tarjetas de números, .cd/.cdc la cuenta regresiva,
// .inf/.callout las lecturas etiquetadas, .scrollnote una ayuda de la pantalla.
//
// Regla de oro: la cuenta regresiva NUNCA viene del documento. Las tarjetas
// .cd se descartan y el código la vuelve a escribir desde los hitos del
// calendario (withCountdown), igual que en el informe generado — si no, el
// informe importado queda con fechas congeladas del día en que se escribió.
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import {
  countdownBlock,
  emailDailyReport,
  saveReport,
  splitReport,
  withCountdown,
  type DailyReport,
} from "@/lib/daily-report";
import { parseReportMarkdown, reportTitle, sectionsOf } from "@/lib/report-markdown";
import { getMonitorConfig } from "@/lib/monitor-config";
import { readCachedItems } from "@/lib/listening-cache";
import { getClientBrief, mergeBriefUpdates, saveClientBrief } from "@/lib/client-brief";
import { log } from "@/lib/logger";

// Techo de entrada. El informe del 26/08 pesa ~80 KB con la imagen embebida;
// 400.000 deja margen sobrado y frena un pegado accidental de un sitio entero.
export const MAX_IMPORT_CHARS = 400_000;

// Etiquetas de largo máximo para el título.
const MAX_TITULO = 200;

// Lo que nunca es informe. `head` incluido porque el parser de turndown recibe
// el documento completo cuando le pasan un HTML con <html>/<head>.
const DROP_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "NAV", "HEADER", "FOOTER",
  "IMG", "SVG", "IFRAME", "FORM", "BUTTON", "TEMPLATE",
]);
// .scrollnote es una instrucción de la pantalla ("deslizá la tabla"), no del
// informe. .cd/.cdc es la cuenta regresiva, que reescribe el código.
const DROP_CLASSES = ["scrollnote", "cd", "cdc"];

function hasClass(node: HTMLElement, cls: string): boolean {
  const raw = typeof node.getAttribute === "function" ? node.getAttribute("class") : null;
  if (!raw) return false;
  return raw.trim().split(/\s+/).includes(cls);
}

const clean = (s: string): string => s.replace(/\s+/g, " ").trim();
// Las líneas del bloque ```kpi se separan con "|": un pipe adentro de un valor
// partiría la línea en columnas fantasma.
const cellText = (s: string): string => clean(s).replace(/\|/g, "/");
const textOf = (el: HTMLElement, sel: string): string => cellText(el.querySelector(sel)?.textContent ?? "");

// Un párrafo que ya viene etiquetado no se vuelve a etiquetar.
const YA_ETIQUETADO = /^\*\*(Inferencia|Advertencia)\b/i;

function buildService(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
  });
  td.use(gfm);
  td.remove((node) => DROP_TAGS.has(node.nodeName) || DROP_CLASSES.some((c) => hasClass(node, c)));

  // <h2><span class="num">01</span>El escenario</h2> → "## 01 El escenario".
  // Sin esto sale "## 01El escenario" y missingSections/sectionsOf leen mal la
  // estructura. El span de Fuentes trae &nbsp;: trim() lo limpia y no deja
  // espacio adelante del título.
  td.addRule("numeroDeSeccion", {
    filter: (node) => node.nodeName === "SPAN" && hasClass(node, "num"),
    replacement: (content) => {
      const t = content.trim();
      return t ? `${t} ` : "";
    },
  });

  // <span class="pill">Mañana</span>Preparar… → "**Mañana** · Preparar…".
  // Sin la regla los dos textos quedan pegados ("MañanaPreparar").
  td.addRule("pill", {
    filter: (node) => node.nodeName === "SPAN" && hasClass(node, "pill"),
    replacement: (content) => {
      const t = content.trim();
      return t ? `**${t}** · ` : "";
    },
  });

  // <p><span class="inf">Inferencia</span>La relación…</p> →
  // "**Inferencia** La relación…", que es lo que parseReportMarkdown lee como
  // callout (regla editorial: toda lectura que no sea dato medido va marcada).
  td.addRule("etiquetaInline", {
    filter: (node) => node.nodeName === "SPAN" && (hasClass(node, "inf") || hasClass(node, "adv")),
    replacement: (content) => {
      const t = content.trim();
      return t ? `**${t}** ` : "";
    },
  });

  // .kpis (o una .kpi suelta) → bloque ```kpi, una línea por número:
  // `valor | etiqueta | nota`, que es el formato que parsea report-markdown.
  // El HTML pone el valor en .v, la etiqueta en .k y la nota en .d.
  td.addRule("kpis", {
    filter: (node) => node.nodeName === "DIV" && (hasClass(node, "kpis") || hasClass(node, "kpi")),
    replacement: (_content, node) => {
      const cards = hasClass(node, "kpi")
        ? [node]
        : (Array.from(node.querySelectorAll(".kpi")) as HTMLElement[]);
      const lines = cards
        .map((c) => ({ v: textOf(c, ".v"), k: textOf(c, ".k"), d: textOf(c, ".d") }))
        .filter((x) => x.v && x.k)
        .map((x) => `${x.v} | ${x.k} | ${x.d}`);
      if (lines.length === 0) return "";
      return `\n\n\`\`\`kpi\n${lines.join("\n")}\n\`\`\`\n\n`;
    },
  });

  // .callout / div.inf → un párrafo etiquetado. El .callout del informe de
  // referencia es la lectura de apertura de la sección, no un dato medido: se
  // etiqueta como Inferencia salvo que ya traiga su propia etiqueta.
  td.addRule("callout", {
    filter: (node) => node.nodeName === "DIV" && (hasClass(node, "callout") || hasClass(node, "inf")),
    replacement: (content) => {
      const t = content.replace(/\s*\n+\s*/g, " ").trim();
      if (!t) return "";
      return YA_ETIQUETADO.test(t) ? `\n\n${t}\n\n` : `\n\n**Inferencia** ${t}\n\n`;
    },
  });

  return td;
}

export function htmlToMarkdown(html: string): string {
  if (html.length > MAX_IMPORT_CHARS) {
    throw new Error(`El informe supera los ${MAX_IMPORT_CHARS} caracteres`);
  }
  return normalize(buildService().turndown(html));
}

function normalize(md: string): string {
  return md
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// El informe abre con "# " y la tesis del día. Si el documento no trae h1, se
// usa el título explícito; si tampoco hay, la primera línea con contenido SE
// CONVIERTE en el h1 (no se duplica arriba).
function ensureTitle(md: string, titulo?: string): string {
  if (reportTitle(md)) return md;
  const t = (titulo ?? "").trim().slice(0, MAX_TITULO);
  if (t) return `# ${t}\n\n${md}`.trim();
  const lines = md.split("\n");
  const i = lines.findIndex((l) => l.trim());
  if (i === -1) return md;
  const primera = lines[i].trim().replace(/^#+\s*/, "").slice(0, MAX_TITULO);
  if (!primera) return md;
  return [...lines.slice(0, i), `# ${primera}`, ...lines.slice(i + 1)].join("\n");
}

function isoOrThrow(at: string): string {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) throw new Error(`Fecha inválida: ${at}`);
  return new Date(t).toISOString();
}

export interface ImportReportInput {
  markdown?: string;
  html?: string;
  titulo?: string;
  at?: string; // ISO; default: ahora
  notaOperativa?: string;
  briefUpdates?: { seccion: string; texto: string }[];
  origen: "claude-chrome" | "import";
  conversationUrl?: string;
  enviarMail?: boolean; // default true
}

export interface ImportReportResult {
  at: string;
  titulo: string;
  secciones: number;
  briefUpdates: number;
  mailSent: boolean;
  mailError?: string;
}

export async function importReport(
  projectId: string,
  input: ImportReportInput,
): Promise<ImportReportResult> {
  const esMarkdown = Boolean(input.markdown?.trim());
  const esHtml = !esMarkdown && Boolean(input.html?.trim());
  if (!esMarkdown && !esHtml) {
    throw new Error("Mandá markdown o html: llegaron los dos vacíos");
  }
  const fuente = esMarkdown ? input.markdown! : input.html!;
  if (fuente.length > MAX_IMPORT_CHARS) {
    throw new Error(`El informe supera los ${MAX_IMPORT_CHARS} caracteres`);
  }
  const at = input.at ? isoOrThrow(input.at) : new Date().toISOString();

  const crudo = esMarkdown ? normalize(fuente) : htmlToMarkdown(fuente);
  // Mismo camino que el informe generado: el bloque ```json final es interno
  // (propuestas de brief + nota operativa) y no viaja en el cuerpo.
  const { markdown: cuerpo, briefUpdates: delJson, notaOperativa: notaJson } = splitReport(crudo);
  const monitor = await getMonitorConfig(projectId);
  const markdown = withCountdown(ensureTitle(cuerpo, input.titulo), countdownBlock(monitor.calendar));

  const blocks = parseReportMarkdown(markdown);
  // Solo headings no es un informe: sin cuerpo no se guarda nada.
  if (blocks.filter((b) => b.t !== "h").length === 0) {
    throw new Error("El informe no tiene ninguna sección reconocible");
  }

  const [items24, items7] = await Promise.all([
    readCachedItems(projectId, 1),
    readCachedItems(projectId, 7),
  ]);
  const titulo = reportTitle(markdown) ?? "Informe importado";
  const report: DailyReport = {
    at,
    markdown,
    items24h: items24.length,
    items7d: items7.length,
    origen: input.origen,
    titulo,
    conversationUrl: input.conversationUrl,
    notaOperativa: input.notaOperativa?.trim() || notaJson,
  };
  await saveReport(projectId, report);

  // Propuestas de brief: las del argumento (las manda la tool) más las del
  // bloque json. mergeBriefUpdates dedupea contra las ya conocidas y capea en
  // 8; contamos las que realmente entraron, no la diferencia de largos (el
  // pruning de resueltas la falsearía).
  const updates = [...(input.briefUpdates ?? []), ...delJson];
  let sumadas = 0;
  if (updates.length > 0) {
    try {
      const brief = await getClientBrief(projectId);
      const antes = new Set((brief.pendingUpdates ?? []).map((u) => u.id));
      const next = mergeBriefUpdates(brief, updates, at);
      sumadas = (next.pendingUpdates ?? []).filter((u) => !antes.has(u.id)).length;
      if (sumadas > 0) await saveClientBrief(projectId, next);
    } catch (e) {
      // El informe ya está guardado: una falla acá no puede frenar el mail.
      log.warn("report_import.brief_updates_failed", { projectId, error: (e as Error).message });
    }
  }

  let mailSent = false;
  let mailError: string | undefined;
  if (input.enviarMail !== false) {
    try {
      const { sent } = await emailDailyReport(projectId, report);
      mailSent = sent > 0;
      if (!mailSent) mailError = "sin owners del proyecto o Resend sin configurar";
    } catch (e) {
      mailError = (e as Error).message;
    }
  }

  const secciones = sectionsOf(blocks).filter((s) => s.title).length;
  log.info("report_import.saved", {
    projectId,
    at,
    origen: input.origen,
    secciones,
    briefUpdates: sumadas,
    mailSent,
  });
  return { at, titulo, secciones, briefUpdates: sumadas, mailSent, mailError };
}
```

- [ ] **Step 5: Correr los tests — tienen que pasar**

```bash
npx vitest run tests/report-import.test.ts tests/daily-report-split.test.ts tests/daily-report-email.test.ts tests/daily-report-pdf.test.ts
npx tsc --noEmit
npx eslint lib/report-import.ts lib/daily-report.ts types/turndown-plugin-gfm.d.ts tests/report-import.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add -- lib/report-import.ts lib/daily-report.ts types/turndown-plugin-gfm.d.ts tests/report-import.test.ts tests/fixtures/informe-ferro.html && git commit -m "feat: importación de informes escritos afuera (HTML/Markdown) al historial" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XW7g7dSqmfsaVwruSZ87N8" -- lib/report-import.ts lib/daily-report.ts types/turndown-plugin-gfm.d.ts tests/report-import.test.ts tests/fixtures/informe-ferro.html
```

---

### Task 3: `lib/mcp/tools.ts` — las 10 tools como handlers puros

**Depende de:** Tasks 1 y 2.

**Files:** Create `lib/mcp/tools.ts`; Test `tests/mcp-tools.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// tests/mcp-tools.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/projects", () => ({
  getProject: async () => ({ id: "p1", nombre: "Ferro", slug: "ferro", created_by: null, archived_at: null, created_at: "" }),
}));
vi.mock("@/lib/listening-config", () => ({
  getListeningConfig: async () => ({ zona: "Caballito", pais: "AR", keywords: ["ferro", "elecciones"] }),
}));
let monitor = {
  accounts: [
    { handle: "somosferro2026", platform: "instagram", category: "organizacion" },
    { handle: "ferroweb", platform: "instagram", category: "medio", vinculo: "independiente" },
  ],
  searchesA: [],
  searchesB: [],
  calendar: [{ label: "Elección", date: "2999-01-01" }],
  noRepetir: [],
  budget: {},
  entidades: {},
};
vi.mock("@/lib/monitor-config", async (orig) => ({
  ...(await orig<typeof import("@/lib/monitor-config")>()),
  getMonitorConfig: async () => monitor,
}));

let reports = {
  latest: {
    at: "2026-08-26T15:00:00.000Z",
    markdown: "# Tesis del 26\n\nBajada.\n\n## 01 El escenario\n\nTexto.",
    items24h: 12,
    items7d: 40,
    origen: "claude-chrome" as const,
    titulo: "Tesis del 26",
  },
  history: [
    { at: "2026-08-25T15:00:00.000Z", markdown: "# Tesis del 25\n\nB.", items24h: 8, items7d: 30 },
  ],
};
vi.mock("@/lib/daily-report", async (orig) => ({
  ...(await orig<typeof import("@/lib/daily-report")>()),
  readDailyReports: async () => reports,
}));

vi.mock("@/lib/monitor-metrics", () => ({
  accountMetrics: async () => [
    {
      handle: "somosferro2026",
      category: "organizacion",
      followers: 1200,
      amplificacion: 0.5,
      adhesion: 0.05,
      densidad: 0.5,
      comentarios: 23,
      comentaristas: 19,
      muestraComentarios: [{ autor: "c1", text: "groso" }],
      piezas: 3,
      ultimaActividad: "2026-08-26T12:00:00.000Z",
      historiasVivas: 2,
      ultimaPieza: { text: "Caballito te saluda", likeCount: 600, at: "2026-08-26T12:00:00.000Z" },
    },
  ],
}));

const cached = [
  { source: "instagram/extension", text: "propuesta de salud mental", url: "https://ig/1", author: "ferroenaccion", publishedAt: "2026-08-26T14:00:00.000Z", meta: { likeCount: 3, commentCount: 23 } },
  { source: "x/extension", text: "perdieron las elecciones hoy", url: "https://x/2", author: "DeSocios", publishedAt: "2026-08-20T14:00:00.000Z" },
];
vi.mock("@/lib/listening-cache", () => ({ readCachedItems: async () => cached }));

vi.mock("@/lib/extension-run", () => ({
  readExtensionRun: async () => ({ at: "2026-08-26T13:00:00.000Z", cuentas: 6, busquedas: 4, items: 120, candidatos: 9, sugeridos: 2, errores: [{ platform: "instagram", step: "perfil", detail: "400" }] }),
}));

let brief: import("@/lib/client-brief").ClientBrief = {
  entries: [{ id: "e1", at: "2026-08-20T00:00:00.000Z", by: "ana@x.ar", text: "Aporte del operador." }],
  master: { text: "# BRIEF MAESTRO\n\nClub Ferro.", updatedAt: "2026-08-20T00:00:00.000Z", by: "ana@x.ar" },
  pendingUpdates: [],
  suggestions: [],
};
const saveClientBrief = vi.fn(async (_p: string, b: typeof brief) => { brief = b; });
vi.mock("@/lib/client-brief", async (orig) => ({
  ...(await orig<typeof import("@/lib/client-brief")>()),
  getClientBrief: async () => brief,
  saveClientBrief: (p: string, b: typeof brief) => saveClientBrief(p, b),
}));

let link: import("@/lib/claude-link").ClaudeLink = { conversationUrl: "https://claude.ai/chat/x" };
const saveClaudeLink = vi.fn(async (_p: string, l: typeof link) => { link = l; });
vi.mock("@/lib/claude-link", async (orig) => ({
  ...(await orig<typeof import("@/lib/claude-link")>()),
  readClaudeLink: async () => link,
  saveClaudeLink: (p: string, l: typeof link) => saveClaudeLink(p, l),
}));

const importReport = vi.fn(async () => ({ at: "2026-08-26T15:30:00.000Z", titulo: "Tesis", secciones: 4, briefUpdates: 1, mailSent: true }));
vi.mock("@/lib/report-import", () => ({ importReport: (...a: unknown[]) => importReport(...(a as [])) }));

import { makeTools, TOOL_NAMES } from "@/lib/mcp/tools";

const tools = makeTools("p1");
const byName = new Map(tools.map((t) => [t.name, t]));
const run = (name: string, args: Record<string, unknown> = {}) => byName.get(name)!.handler(args);

describe("makeTools", () => {
  beforeEach(() => {
    importReport.mockClear();
    saveClientBrief.mockClear();
    saveClaudeLink.mockClear();
    brief = { ...brief, pendingUpdates: [] };
    link = { conversationUrl: "https://claude.ai/chat/x" };
  });

  it("expone exactamente las 10 tools de la spec, con descripción y schema", () => {
    expect(tools.map((t) => t.name)).toEqual([
      "get_project",
      "get_brief",
      "propose_brief_updates",
      "get_metrics",
      "get_recent_items",
      "get_run_status",
      "list_reports",
      "get_report",
      "save_report",
      "link_conversation",
    ]);
    expect(tools.map((t) => t.name)).toEqual([...TOOL_NAMES]);
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(20);
      expect(typeof t.inputSchema.parse).toBe("function");
    }
  });

  it("ninguna tool acepta projectId: el proyecto lo resuelve el token", () => {
    for (const t of tools) {
      expect(Object.keys(t.inputSchema.shape)).not.toContain("projectId");
    }
  });

  it("get_project: nombre, zona, conversación, hitos, cuentas por categoría, brief y último informe", async () => {
    const out = await run("get_project");
    expect(out).toContain("Ferro");
    expect(out).toContain("Caballito");
    expect(out).toContain("https://claude.ai/chat/x");
    expect(out).toMatch(/Elección/);
    expect(out).toContain("organizacion");
    expect(out).toContain("@somosferro2026");
    expect(out).toContain("2026-08-26");
  });

  it("get_brief: devuelve maestro + aportes y las propuestas pendientes", async () => {
    brief = { ...brief, pendingUpdates: [{ id: "u1", seccion: "3.5", texto: "Cuenta nueva", reportAt: "2026-08-26T00:00:00.000Z", status: "pending" }] };
    const out = await run("get_brief");
    expect(out).toContain("# BRIEF MAESTRO");
    expect(out).toContain("Aporte del operador.");
    expect(out).toContain("3.5");
    expect(out).toContain("Cuenta nueva");
  });

  it("propose_brief_updates: deja pendientes, nunca edita el maestro", async () => {
    const out = await run("propose_brief_updates", { updates: [{ seccion: "3.5", texto: "Hecho nuevo" }] });
    expect(out).toMatch(/1/);
    expect(brief.pendingUpdates?.[0]).toMatchObject({ seccion: "3.5", texto: "Hecho nuevo", status: "pending" });
    expect(brief.master?.text).toBe("# BRIEF MAESTRO\n\nClub Ferro.");
  });

  it("propose_brief_updates: sin updates válidas no guarda", async () => {
    await expect(run("propose_brief_updates", { updates: [] })).rejects.toThrow();
    expect(saveClientBrief).not.toHaveBeenCalled();
  });

  it("get_metrics: una línea por cuenta y la muestra anonimizada de comentarios", async () => {
    const out = await run("get_metrics", { days: 7 });
    expect(out).toContain("@somosferro2026");
    expect(out).toContain("seg:1200");
    expect(out).toContain("dens:50%");
    expect(out).toContain("[c1]");
  });

  it("get_recent_items: filtra por ventana horaria y por fuente, y respeta el límite", async () => {
    const out = await run("get_recent_items", { hours: 24 });
    expect(out).toContain("propuesta de salud mental");
    expect(out).not.toContain("perdieron las elecciones hoy");
    const todo = await run("get_recent_items", { hours: 24 * 30 });
    expect(todo).toContain("perdieron las elecciones hoy");
    const soloX = await run("get_recent_items", { hours: 24 * 30, source: "x" });
    expect(soloX).toContain("perdieron las elecciones hoy");
    expect(soloX).not.toContain("propuesta de salud mental");
    const uno = await run("get_recent_items", { hours: 24 * 30, limit: 1 });
    expect(uno.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(1);
  });

  it("get_run_status: última corrida con sus errores", async () => {
    const out = await run("get_run_status");
    expect(out).toContain("2026-08-26");
    expect(out).toContain("6");
    expect(out).toContain("instagram");
    expect(out).toContain("400");
  });

  it("list_reports: at, título, origen e items24h; los previos al campo dicen tronador", async () => {
    const out = await run("list_reports", { limit: 10 });
    expect(out).toContain("2026-08-26T15:00:00.000Z");
    expect(out).toContain("Tesis del 26");
    expect(out).toContain("claude-chrome");
    expect(out).toContain("Tesis del 25");
    expect(out).toContain("tronador");
  });

  it("get_report: sin at devuelve el último; con at, el del historial", async () => {
    expect(await run("get_report")).toContain("# Tesis del 26");
    expect(await run("get_report", { at: "2026-08-25T15:00:00.000Z" })).toContain("# Tesis del 25");
    await expect(run("get_report", { at: "2020-01-01T00:00:00.000Z" })).rejects.toThrow(/no hay informe/i);
  });

  it("save_report: delega en importReport con origen claude-chrome y la conversación vinculada", async () => {
    const out = await run("save_report", { html: "<h1>x</h1><p>y</p>", titulo: "T", enviarMail: true });
    expect(importReport).toHaveBeenCalledTimes(1);
    const [pid, input] = importReport.mock.calls[0] as [string, import("@/lib/report-import").ImportReportInput];
    expect(pid).toBe("p1");
    expect(input.origen).toBe("claude-chrome");
    expect(input.conversationUrl).toBe("https://claude.ai/chat/x");
    expect(input.enviarMail).toBe(true);
    expect(out).toContain("2026-08-26T15:30:00.000Z");
    expect(out).toContain("4");
  });

  it("save_report: sin markdown ni html no llama a importReport", async () => {
    await expect(run("save_report", {})).rejects.toThrow(/markdown|html/i);
    expect(importReport).not.toHaveBeenCalled();
  });

  it("link_conversation: guarda la URL válida y marca linkedAt", async () => {
    const out = await run("link_conversation", { conversationUrl: "https://claude.ai/chat/nueva" });
    expect(link.conversationUrl).toBe("https://claude.ai/chat/nueva");
    expect(link.linkedAt).toBeTruthy();
    expect(out).toContain("https://claude.ai/chat/nueva");
  });

  it("link_conversation: rechaza cualquier URL que no sea de claude.ai", async () => {
    await expect(run("link_conversation", { conversationUrl: "https://chatgpt.com/c/x" })).rejects.toThrow(/claude\.ai/);
    expect(saveClaudeLink).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr el test — tiene que fallar**

```bash
npx vitest run tests/mcp-tools.test.ts
```

Falla esperada: `Failed to resolve import "@/lib/mcp/tools"`.

- [ ] **Step 3: Implementación**

```ts
// lib/mcp/tools.ts
// Las 10 tools del servidor MCP por proyecto (spec §3), como funciones puras:
// nombre, descripción, schema zod y un handler que devuelve TEXTO. El envoltorio
// del protocolo ({ content: [{ type: "text", text }] }) lo pone la ruta, así que
// acá no se importa nada de mcp-handler ni del SDK y los tests llaman a los
// handlers directo.
//
// Ninguna tool recibe projectId: el proyecto lo resuelve el token de la URL y
// viaja por el closure de makeTools(). Ninguna tool ejecuta barridos ni edita
// la configuración del monitor: el escenario se sigue aplicando desde el panel.
import { z } from "zod";
import { getProject } from "@/lib/projects";
import { getListeningConfig } from "@/lib/listening-config";
import { getMonitorConfig } from "@/lib/monitor-config";
import {
  commentsSection,
  countdownItems,
  metricsLine,
  readDailyReports,
  type DailyReport,
} from "@/lib/daily-report";
import { accountMetrics } from "@/lib/monitor-metrics";
import { readCachedItems } from "@/lib/listening-cache";
import { readExtensionRun } from "@/lib/extension-run";
import {
  briefHash,
  briefText,
  getClientBrief,
  mergeBriefUpdates,
  saveClientBrief,
} from "@/lib/client-brief";
import { isClaudeConversationUrl, readClaudeLink, saveClaudeLink } from "@/lib/claude-link";
import { importReport } from "@/lib/report-import";

// Orden y nombres exactos: la ruta los registra en este orden y el panel los
// documenta con estos nombres. Cambiar uno acá obliga a cambiar el texto de
// ayuda de components/escucha/claude-link-card.tsx.
export const TOOL_NAMES = [
  "get_project",
  "get_brief",
  "propose_brief_updates",
  "get_metrics",
  "get_recent_items",
  "get_run_status",
  "list_reports",
  "get_report",
  "save_report",
  "link_conversation",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface McpToolDef {
  name: ToolName;
  title: string;
  description: string;
  // Schema completo (no raw shape): mcp-handler 2.x / MCP SDK v2 lo exigen así.
  inputSchema: z.ZodObject<z.ZodRawShape>;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

const HORAS_MAX = 24 * 30;
const ITEMS_MAX = 200;

const Empty = z.object({});
const MetricsArgs = z.object({
  days: z.number().int().min(1).max(30).default(7).describe("Ventana en días"),
});
const RecentItemsArgs = z.object({
  hours: z.number().int().min(1).max(HORAS_MAX).default(24).describe("Ventana en horas"),
  limit: z.number().int().min(1).max(ITEMS_MAX).default(100).describe("Máximo de menciones"),
  source: z.string().trim().min(1).max(60).optional().describe("Filtro por fuente, subcadena (ej. \"instagram\", \"x\")"),
});
const ListReportsArgs = z.object({
  limit: z.number().int().min(1).max(15).default(10),
});
const GetReportArgs = z.object({
  at: z.string().trim().min(1).optional().describe("ISO exacto del informe; sin esto, el último"),
});
const BriefUpdatesArgs = z.object({
  updates: z
    .array(z.object({ seccion: z.string().trim().min(1).max(120), texto: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(8),
});
const LinkArgs = z.object({
  conversationUrl: z.string().trim().min(1).max(500),
});
const SaveReportArgs = z.object({
  markdown: z.string().max(400_000).optional(),
  html: z.string().max(400_000).optional(),
  titulo: z.string().trim().max(200).optional(),
  at: z.string().trim().min(1).optional().describe("ISO del informe; sin esto, ahora"),
  notaOperativa: z.string().trim().max(600).optional(),
  briefUpdates: z
    .array(z.object({ seccion: z.string().trim().min(1).max(120), texto: z.string().trim().min(1).max(2000) }))
    .max(8)
    .optional(),
  enviarMail: z.boolean().default(true),
});

const fecha = (iso: string): string => (iso ? iso.slice(0, 10) : "s/d");
const origenDe = (r: DailyReport): string => r.origen ?? "tronador";

export function makeTools(projectId: string): McpToolDef[] {
  return [
    {
      name: "get_project",
      title: "Proyecto",
      description:
        "Contexto del proyecto: nombre, zona, keywords monitoreadas, conversación de Claude vinculada, hitos del calendario en días que faltan, cuentas del plan agrupadas por categoría, versión del brief y fecha del último informe.",
      inputSchema: Empty,
      handler: async () => {
        const [project, cfg, monitor, brief, store, link] = await Promise.all([
          getProject(projectId),
          getListeningConfig(projectId),
          getMonitorConfig(projectId),
          getClientBrief(projectId),
          readDailyReports(projectId),
          readClaudeLink(projectId),
        ]);
        const hitos = countdownItems(monitor.calendar);
        const porCategoria = new Map<string, string[]>();
        for (const a of monitor.accounts) {
          const list = porCategoria.get(a.category) ?? [];
          list.push(`@${a.handle.replace(/^@/, "")} (${a.platform})${a.vinculo ? ` · vínculo: ${a.vinculo}` : ""}`);
          porCategoria.set(a.category, list);
        }
        const cuentas = [...porCategoria.entries()]
          .map(([cat, hs]) => `- [${cat}] ${hs.join(", ")}`)
          .join("\n");
        return [
          `Proyecto: ${project?.nombre ?? projectId}`,
          `Zona: ${cfg.zona || "sin definir"} (${cfg.pais})`,
          `Keywords: ${cfg.keywords.join(", ") || "(ninguna)"}`,
          `Conversación vinculada: ${link.conversationUrl ?? "(sin vincular)"}`,
          "",
          "## Hitos en días",
          hitos.length
            ? hitos.map((h) => `- faltan ${h.days} días para ${h.label} (${h.detail})`).join("\n")
            : "(sin hitos cargados)",
          "",
          "## Cuentas del plan por categoría (NUNCA se comparan entre categorías)",
          cuentas || "(sin cuentas cargadas)",
          "",
          `Brief: ${brief.master ? `maestro del ${fecha(brief.master.updatedAt)}` : "sin maestro"}, ${brief.entries.length} aportes, hash ${briefHash(brief)}`,
          `Propuestas de brief pendientes: ${(brief.pendingUpdates ?? []).filter((u) => u.status === "pending").length}`,
          `Último informe: ${store.latest ? `${store.latest.at} · ${store.latest.titulo ?? "(sin título)"} · origen ${origenDe(store.latest)}` : "(todavía no hay)"}`,
        ].join("\n");
      },
    },
    {
      name: "get_brief",
      title: "Brief del cliente",
      description:
        "Brief maestro del cliente más los aportes fechados del operador, exactamente como los lee el informe diario, y las propuestas de actualización que todavía están pendientes de revisión.",
      inputSchema: Empty,
      handler: async () => {
        const brief = await getClientBrief(projectId);
        const cuerpo = briefText(brief) || "(el brief está vacío)";
        const pendientes = (brief.pendingUpdates ?? []).filter((u) => u.status === "pending");
        return [
          cuerpo,
          "",
          `## Propuestas pendientes (${pendientes.length})`,
          pendientes.length
            ? pendientes.map((u) => `- [§${u.seccion} · informe ${fecha(u.reportAt)}] ${u.texto}`).join("\n")
            : "(ninguna)",
        ].join("\n");
      },
    },
    {
      name: "propose_brief_updates",
      title: "Proponer actualizaciones del brief",
      description:
        "Propone hechos nuevos para incorporar al brief maestro. NO edita el maestro: quedan pendientes y el operador acepta o descarta desde el panel. Hasta 8 por llamada; las repetidas se descartan.",
      inputSchema: BriefUpdatesArgs,
      handler: async (raw) => {
        const { updates } = BriefUpdatesArgs.parse(raw);
        const at = new Date().toISOString();
        const brief = await getClientBrief(projectId);
        const antes = new Set((brief.pendingUpdates ?? []).map((u) => u.id));
        const next = mergeBriefUpdates(brief, updates, at);
        const sumadas = (next.pendingUpdates ?? []).filter((u) => !antes.has(u.id)).length;
        if (sumadas > 0) await saveClientBrief(projectId, next);
        return `Propuestas recibidas: ${updates.length}. Nuevas pendientes: ${sumadas} (las repetidas se descartaron). El maestro no se tocó.`;
      },
    },
    {
      name: "get_metrics",
      title: "Métricas por cuenta",
      description:
        "Métricas medidas por cuenta del plan en la ventana pedida: seguidores, amplificación (vistas/seguidor), adhesión (likes/seguidor), comentarios, densidad de comentaristas recurrentes, piezas, historias vivas, última actividad y última pieza. Incluye una muestra de comentarios con los autores anonimizados. No se comparan cuentas de categorías distintas.",
      inputSchema: MetricsArgs,
      handler: async (raw) => {
        const { days } = MetricsArgs.parse(raw);
        const metrics = await accountMetrics(projectId, days);
        if (metrics.length === 0) return "(sin métricas: no hay cuentas cargadas o no hay piezas en la ventana)";
        return [
          `## Métricas por cuenta (ventana ${days} días)`,
          metrics.map(metricsLine).join("\n"),
          "",
          "## Comentarios recientes por cuenta (muestra, autores anonimizados c1..cN)",
          commentsSection(metrics),
        ].join("\n");
      },
    },
    {
      name: "get_recent_items",
      title: "Menciones recientes",
      description:
        "Menciones del historial del proyecto en las últimas N horas: fuente, autor, texto, URL, fecha y métricas cuando el colector las trajo. Opcionalmente filtradas por fuente (subcadena).",
      inputSchema: RecentItemsArgs,
      handler: async (raw) => {
        const { hours, limit, source } = RecentItemsArgs.parse(raw);
        const days = Math.max(1, Math.ceil(hours / 24));
        const corte = Date.now() - hours * 3600_000;
        const q = source?.toLowerCase();
        const items = (await readCachedItems(projectId, days))
          .filter((i) => !i.publishedAt || Date.parse(i.publishedAt) >= corte)
          .filter((i) => !q || i.source.toLowerCase().includes(q) || (i.author ?? "").toLowerCase().includes(q))
          .slice(0, limit);
        if (items.length === 0) return `(sin menciones en las últimas ${hours} horas${source ? ` para "${source}"` : ""})`;
        const line = (i: (typeof items)[number]) => {
          const m = (i.meta ?? {}) as Record<string, unknown>;
          const nums = ["likeCount", "commentCount", "viewCount", "repostCount", "replyCount"]
            .filter((k) => typeof m[k] === "number")
            .map((k) => `${k}:${m[k]}`)
            .join(" ");
          return `- [${i.source}${i.author ? ` · ${i.author}` : ""}] ${i.text.slice(0, 300)}${i.url ? ` — ${i.url}` : ""}${i.publishedAt ? ` (${i.publishedAt})` : ""}${nums ? ` {${nums}}` : ""}`;
        };
        return [`## ${items.length} menciones en ${hours} h`, items.map(line).join("\n")].join("\n");
      },
    },
    {
      name: "get_run_status",
      title: "Última corrida de la extensión",
      description:
        "Resumen de la última corrida de la extensión de Chrome: cuándo fue, cuántas cuentas y búsquedas recorrió, cuántos items y candidatos trajo, y los errores por plataforma. Sirve para saber si el dato de hoy está completo antes de escribir el informe.",
      inputSchema: Empty,
      handler: async () => {
        const run = await readExtensionRun(projectId);
        if (!run) return "(todavía no corrió la extensión en este proyecto)";
        const errores = run.errores.length
          ? run.errores.map((e) => `- [${e.platform}${e.handle ? ` @${e.handle}` : ""}] ${e.step}: ${e.detail}`).join("\n")
          : "(sin errores)";
        return [
          `Última corrida: ${run.at || "s/d"}`,
          `cuentas: ${run.cuentas} · búsquedas: ${run.busquedas} · items: ${run.items} · candidatos: ${run.candidatos} · sugeridos: ${run.sugeridos}`,
          `## Errores (${run.errores.length})`,
          errores,
        ].join("\n");
      },
    },
    {
      name: "list_reports",
      title: "Informes guardados",
      description:
        "Lista los informes del historial, del más nuevo al más viejo: fecha ISO exacta (la que pide get_report), título, origen (tronador / claude-chrome / import) y menciones de las 24 h de ese día.",
      inputSchema: ListReportsArgs,
      handler: async (raw) => {
        const { limit } = ListReportsArgs.parse(raw);
        const store = await readDailyReports(projectId);
        const all = [store.latest, ...store.history].filter((r): r is DailyReport => Boolean(r)).slice(0, limit);
        if (all.length === 0) return "(todavía no hay informes)";
        return all
          .map((r) => `- ${r.at} · ${r.titulo ?? "(sin título)"} · origen ${origenDe(r)} · ${r.items24h} menciones 24h`)
          .join("\n");
      },
    },
    {
      name: "get_report",
      title: "Leer un informe",
      description:
        "Devuelve el Markdown de un informe. Sin `at`, el último. Ojo: los informes del historial se guardan recortados a 4.000 caracteres; el completo es solo el último.",
      inputSchema: GetReportArgs,
      handler: async (raw) => {
        const { at } = GetReportArgs.parse(raw);
        const store = await readDailyReports(projectId);
        const all = [store.latest, ...store.history].filter((r): r is DailyReport => Boolean(r));
        const report = at ? all.find((r) => r.at === at) : all[0];
        if (!report) throw new Error(at ? `No hay informe con at=${at}` : "No hay informes guardados todavía");
        return [
          `at: ${report.at} · origen: ${origenDe(report)} · ${report.items24h} menciones 24h`,
          report.conversationUrl ? `conversación: ${report.conversationUrl}` : "",
          report.notaOperativa ? `nota operativa: ${report.notaOperativa}` : "",
          "",
          report.markdown,
        ]
          .filter((l) => l !== "")
          .join("\n");
      },
    },
    {
      name: "save_report",
      title: "Guardar un informe",
      description:
        "Guarda un informe escrito en esta conversación al historial del proyecto: acepta Markdown o el HTML completo de la maqueta. Dispara el mail a los owners con el PDF adjunto salvo enviarMail=false, y deja las briefUpdates como propuestas pendientes. La cuenta regresiva la escribe el sistema desde el calendario: no la incluyas.",
      inputSchema: SaveReportArgs,
      handler: async (raw) => {
        const args = SaveReportArgs.parse(raw);
        if (!args.markdown?.trim() && !args.html?.trim()) {
          throw new Error("Mandá markdown o html: llegaron los dos vacíos");
        }
        const link = await readClaudeLink(projectId);
        const r = await importReport(projectId, {
          markdown: args.markdown,
          html: args.html,
          titulo: args.titulo,
          at: args.at,
          notaOperativa: args.notaOperativa,
          briefUpdates: args.briefUpdates,
          origen: "claude-chrome",
          conversationUrl: link.conversationUrl,
          enviarMail: args.enviarMail,
        });
        return [
          `Informe guardado: ${r.at}`,
          `título: ${r.titulo}`,
          `secciones: ${r.secciones}`,
          `propuestas de brief nuevas: ${r.briefUpdates}`,
          `mail: ${r.mailSent ? "enviado con PDF adjunto" : `no enviado${r.mailError ? ` (${r.mailError})` : ""}`}`,
        ].join("\n");
      },
    },
    {
      name: "link_conversation",
      title: "Vincular esta conversación",
      description:
        "Guarda la URL de esta conversación de claude.ai en el proyecto, para que el operador pueda volver a ella desde el panel. Solo se aceptan URLs https://claude.ai/...",
      inputSchema: LinkArgs,
      handler: async (raw) => {
        const { conversationUrl } = LinkArgs.parse(raw);
        if (!isClaudeConversationUrl(conversationUrl)) {
          throw new Error("La URL tiene que ser https://claude.ai/... (no se aceptan otros dominios)");
        }
        const current = await readClaudeLink(projectId);
        await saveClaudeLink(projectId, {
          ...current,
          conversationUrl: conversationUrl.trim(),
          linkedAt: new Date().toISOString(),
        });
        return `Conversación vinculada: ${conversationUrl.trim()}`;
      },
    },
  ];
}
```

- [ ] **Step 4: Correr el test — tiene que pasar**

```bash
npx vitest run tests/mcp-tools.test.ts
npx tsc --noEmit
npx eslint lib/mcp/tools.ts tests/mcp-tools.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add -- lib/mcp/tools.ts tests/mcp-tools.test.ts && git commit -m "feat: las 10 tools MCP del proyecto como handlers puros" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XW7g7dSqmfsaVwruSZ87N8" -- lib/mcp/tools.ts tests/mcp-tools.test.ts
```

---

### Task 4: Ruta `app/api/mcp/[token]/[transport]/route.ts` + rate limit + middleware

**Depende de:** Task 3.

**Files:** Create `lib/mcp/rate-limit.ts`, `app/api/mcp/[token]/[transport]/route.ts`; Modify `middleware.ts`; Test `tests/mcp-route.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// tests/mcp-route.test.ts
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
```

- [ ] **Step 2: Correr el test — tiene que fallar**

```bash
npx vitest run tests/mcp-route.test.ts
```

Falla esperada: `Failed to resolve import "@/app/api/mcp/[token]/[transport]/route"` y `"@/lib/mcp/rate-limit"`.

- [ ] **Step 3: Implementación**

```ts
// lib/mcp/rate-limit.ts
// Token bucket en memoria por token de conector: 60 req/min (spec §1).
//
// CAVEAT SERVERLESS: el contador vive en la memoria de la instancia. En Vercel
// hay varias instancias y se reciclan, así que el límite real es "60/min por
// instancia", no global — alcanza para frenar un bucle de un cliente MCP
// enloquecido, que es para lo que está, y no pretende ser una defensa contra
// un atacante distribuido. Si alguna vez hace falta el límite duro, va con
// Upstash/Redis; hoy no se justifica la dependencia.
export const RATE_LIMIT = 60;
export const RATE_WINDOW_MS = 60_000;

// Tope de baldes vivos: sin esto un atacante que rota tokens inválidos haría
// crecer el Map sin techo. (Los tokens inválidos no llegan acá — la ruta
// verifica primero — pero el tope es barato y evita depender de eso.)
const MAX_BUCKETS = 1000;

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimitOk(key: string, now = Date.now()): boolean {
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (b.count >= RATE_LIMIT) return false;
  buckets.set(key, { count: b.count + 1, resetAt: b.resetAt });
  return true;
}
```

```ts
// app/api/mcp/[token]/[transport]/route.ts
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
    const info = (server as unknown as { server?: { getClientVersion?: () => { name?: string; version?: string } | undefined } })
      .server?.getClientVersion?.();
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
```

> **Si `tsc` se queja en `registerTool`**: el SDK v2 pide `inputSchema extends StandardSchemaWithJSON`, que zod v4 implementa vía `~standard`, pero el `z.ZodObject<z.ZodRawShape>` genérico de `McpToolDef` puede no unificar con ese constraint. El arreglo correcto es **acotar el tipo, no apagar el chequeo**: en `lib/mcp/tools.ts` cambiar `inputSchema: z.ZodObject<z.ZodRawShape>` por `inputSchema: z.ZodType<Record<string, unknown>>` y, si aún así no cierra, un único `as never` en el argumento `inputSchema` de `registerTool` **con comentario** explicando que es el bug del `.d.ts` de `@modelcontextprotocol/server@2.0.0`. Nunca `@ts-ignore` sobre la llamada entera: eso también taparía un error en el callback. Ojo: el test `mcp-tools.test.ts` asserta `Object.keys(t.inputSchema.shape)`, así que si se cambia el tipo hay que mantener `shape` accesible (lo está en cualquier `ZodObject`).

Modificar `middleware.ts`: sin esto **todas** las llamadas MCP se redirigen a `/api/auth/signin` y el conector nunca conecta. Reemplazar el bloque de comentario + `config` del final por:

```ts
// Matchea TODO menos rutas públicas:
//   /api/auth/*       — NextAuth signin/callback
//   /api/cron/*       — protegido por CRON_SECRET
//   /api/webhooks/*   — protegido por firma del provider
//   /api/extension/*  — protegido por token de extensión por proyecto
//   /api/mcp/*        — protegido por el token del conector, que va en el path
//   /api/version      — endpoint público de health/versionado
//   /api/csp-report   — el navegador postea los reportes de CSP sin sesión
//   /encuesta/*       — landing pública para responder encuestas
//   /_next/*, favicon — assets
export const config = {
  matcher: [
    "/((?!api/auth|api/cron|api/webhooks|api/extension|api/mcp|api/version|api/track|api/csp-report|encuesta|e/|brand|signin|share|_next/static|_next/image|_next/data|favicon.ico).*)",
  ],
};
```

- [ ] **Step 4: Correr los tests — tienen que pasar**

```bash
npx vitest run tests/mcp-route.test.ts tests/auth-guard.test.ts
npx tsc --noEmit
npx eslint "app/api/mcp/[token]/[transport]/route.ts" lib/mcp/rate-limit.ts middleware.ts tests/mcp-route.test.ts
```

- [ ] **Step 5: Verificar el arranque real del servidor MCP**

```bash
npx next build
```

El build tiene que listar la ruta `/api/mcp/[token]/[transport]` como dinámica y no fallar por exports inválidos del route handler (Next solo acepta `GET/POST/DELETE/…`, `runtime` y `dynamic`; por eso `rateLimitOk` vive en `lib/mcp/rate-limit.ts` y no en el route file).

- [ ] **Step 6: Commit**

```bash
git add -- "app/api/mcp/[token]/[transport]/route.ts" lib/mcp/rate-limit.ts middleware.ts tests/mcp-route.test.ts && git commit -m "feat: ruta del servidor MCP por proyecto con token en el path" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XW7g7dSqmfsaVwruSZ87N8" -- "app/api/mcp/[token]/[transport]/route.ts" lib/mcp/rate-limit.ts middleware.ts tests/mcp-route.test.ts
```

---

### Task 5: Panel — tarjeta "Claude", actions e historial con origen

**Depende de:** Tasks 1 y 2. Corre en paralelo con 3 y 4.

**Files:** Create `components/escucha/mcp-url-button.tsx`, `components/escucha/claude-link-card.tsx`; Modify `app/(dashboard)/escucha/actions.ts`, `components/escucha/informe-panel.tsx`, `app/(dashboard)/escucha/page.tsx`; Test `tests/escucha-claude-actions.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// tests/escucha-claude-actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }));

let role: "owner" | "editor" | "viewer" = "owner";
vi.mock("@/lib/workspace", () => ({
  requireMember: async (min: string) => {
    if (min === "owner" && role !== "owner") throw new Error("forbidden");
    return { id: "p1", nombre: "Ferro", role };
  },
  requireProject: async () => ({ id: "p1", nombre: "Ferro", role }),
  currentUserEmail: async () => "ana@x.ar",
}));
vi.mock("@/lib/db/supabase", () => ({ dbConfigured: () => true, getSupabase: () => ({}) }));

const issueMcpToken = vi.fn(async () => "p1.deadbeef");
vi.mock("@/lib/mcp-token", async (orig) => ({
  ...(await orig<typeof import("@/lib/mcp-token")>()),
  issueMcpToken: (...a: unknown[]) => issueMcpToken(...(a as [])),
}));

let link: import("@/lib/claude-link").ClaudeLink = {};
const saveClaudeLink = vi.fn(async (_p: string, l: typeof link) => { link = l; });
vi.mock("@/lib/claude-link", async (orig) => ({
  ...(await orig<typeof import("@/lib/claude-link")>()),
  readClaudeLink: async () => link,
  saveClaudeLink: (p: string, l: typeof link) => saveClaudeLink(p, l),
}));

const importReport = vi.fn(async () => ({ at: "2026-08-26T15:30:00.000Z", titulo: "T", secciones: 4, briefUpdates: 1, mailSent: true }));
vi.mock("@/lib/report-import", async (orig) => ({
  ...(await orig<typeof import("@/lib/report-import")>()),
  importReport: (...a: unknown[]) => importReport(...(a as [])),
}));

import { generarUrlMcp, vincularConversacion, importarInforme } from "@/app/(dashboard)/escucha/actions";

// Las actions terminan en redirect(), que en producción lanza. El mock hace lo
// mismo: capturar el throw es la forma de leer a dónde redirigió.
async function run(fn: () => Promise<void>): Promise<string> {
  try {
    await fn();
    return "";
  } catch (e) {
    return (e as Error).message.replace(/^REDIRECT:/, "");
  }
}

const file = (name: string, body: string) => new File([body], name, { type: name.endsWith(".html") ? "text/html" : "text/markdown" });

describe("generarUrlMcp", () => {
  beforeEach(() => { role = "owner"; issueMcpToken.mockClear(); });

  it("owner: emite el token y devuelve la URL completa del conector", async () => {
    const r = await generarUrlMcp();
    expect(issueMcpToken).toHaveBeenCalledWith("p1");
    expect(r.url).toMatch(/\/api\/mcp\/p1\.deadbeef\/mcp$/);
  });

  it("no owner: no emite nada", async () => {
    role = "editor";
    await expect(generarUrlMcp()).rejects.toThrow();
    expect(issueMcpToken).not.toHaveBeenCalled();
  });
});

describe("vincularConversacion", () => {
  beforeEach(() => { role = "editor"; link = {}; saveClaudeLink.mockClear(); });

  it("guarda la URL de claude.ai y vuelve con claude=1", async () => {
    const fd = new FormData();
    fd.set("conversationUrl", " https://claude.ai/chat/2f0c1f9a ");
    expect(await run(() => vincularConversacion(fd))).toBe("/escucha?tab=informe&claude=1");
    expect(link.conversationUrl).toBe("https://claude.ai/chat/2f0c1f9a");
    expect(link.linkedAt).toBeTruthy();
  });

  it("URL de otro dominio: no guarda y avisa", async () => {
    const fd = new FormData();
    fd.set("conversationUrl", "https://chatgpt.com/c/x");
    expect(await run(() => vincularConversacion(fd))).toBe("/escucha?tab=informe&claude_error=url");
    expect(saveClaudeLink).not.toHaveBeenCalled();
  });

  it("vacío: desvincula sin error", async () => {
    link = { conversationUrl: "https://claude.ai/chat/x", lastToolAt: "2026-08-26T00:00:00.000Z" };
    const fd = new FormData();
    fd.set("conversationUrl", "   ");
    expect(await run(() => vincularConversacion(fd))).toBe("/escucha?tab=informe&claude=1");
    expect(link).toEqual({ lastToolAt: "2026-08-26T00:00:00.000Z" });
  });
});

describe("importarInforme", () => {
  beforeEach(() => { role = "editor"; importReport.mockClear(); importReport.mockResolvedValue({ at: "2026-08-26T15:30:00.000Z", titulo: "T", secciones: 4, briefUpdates: 1, mailSent: true }); });

  it("archivo .html: lo importa como html con origen import y mail activado", async () => {
    const fd = new FormData();
    fd.set("archivo", file("informe.html", "<h1>Tesis</h1><p>Bajada</p>"));
    fd.set("enviarMail", "on");
    expect(await run(() => importarInforme(fd))).toBe("/escucha?tab=informe&importado=1");
    const [pid, input] = importReport.mock.calls[0] as [string, import("@/lib/report-import").ImportReportInput];
    expect(pid).toBe("p1");
    expect(input.html).toContain("<h1>Tesis</h1>");
    expect(input.markdown).toBeUndefined();
    expect(input.origen).toBe("import");
    expect(input.enviarMail).toBe(true);
  });

  it("archivo .md: lo importa como markdown", async () => {
    const fd = new FormData();
    fd.set("archivo", file("informe.md", "# Tesis\n\nBajada."));
    expect(await run(() => importarInforme(fd))).toBe("/escucha?tab=informe&importado=1");
    const [, input] = importReport.mock.calls[0] as [string, import("@/lib/report-import").ImportReportInput];
    expect(input.markdown).toContain("# Tesis");
    expect(input.html).toBeUndefined();
    // Sin el checkbox, no sale mail.
    expect(input.enviarMail).toBe(false);
  });

  it("texto pegado que empieza con <: se trata como HTML aunque no haya archivo", async () => {
    const fd = new FormData();
    fd.set("texto", "  <!doctype html><html><body><h1>T</h1><p>B</p></body></html>");
    await run(() => importarInforme(fd));
    const [, input] = importReport.mock.calls[0] as [string, import("@/lib/report-import").ImportReportInput];
    expect(input.html).toContain("<h1>T</h1>");
    expect(input.markdown).toBeUndefined();
  });

  it("texto pegado en markdown: se trata como markdown", async () => {
    const fd = new FormData();
    fd.set("texto", "# Tesis\n\nBajada.");
    await run(() => importarInforme(fd));
    const [, input] = importReport.mock.calls[0] as [string, import("@/lib/report-import").ImportReportInput];
    expect(input.markdown).toBe("# Tesis\n\nBajada.");
  });

  it("nada cargado: no importa y avisa", async () => {
    expect(await run(() => importarInforme(new FormData()))).toBe("/escucha?tab=informe&informe_error=vacio");
    expect(importReport).not.toHaveBeenCalled();
  });

  it("por encima del límite: no importa y avisa", async () => {
    const fd = new FormData();
    fd.set("texto", "x".repeat(400_001));
    expect(await run(() => importarInforme(fd))).toBe("/escucha?tab=informe&informe_error=grande");
    expect(importReport).not.toHaveBeenCalled();
  });

  it("si la importación falla, el mensaje vuelve en informe_error", async () => {
    importReport.mockRejectedValueOnce(new Error("El informe no tiene ninguna sección reconocible"));
    const fd = new FormData();
    fd.set("texto", "# T\n\nB.");
    const url = await run(() => importarInforme(fd));
    expect(url.startsWith("/escucha?tab=informe&informe_error=")).toBe(true);
    expect(decodeURIComponent(url)).toContain("ninguna sección reconocible");
  });
});
```

- [ ] **Step 2: Correr el test — tiene que fallar**

```bash
npx vitest run tests/escucha-claude-actions.test.ts
```

Falla esperada: `generarUrlMcp is not a function` / `does not provide an export named 'generarUrlMcp'`.

- [ ] **Step 3: Implementación — actions**

En `app/(dashboard)/escucha/actions.ts`, agregar los imports que faltan junto a los existentes:

```ts
import { issueMcpToken, mcpUrl } from "@/lib/mcp-token";
import { isClaudeConversationUrl, readClaudeLink, saveClaudeLink } from "@/lib/claude-link";
import { importReport, MAX_IMPORT_CHARS } from "@/lib/report-import";
```

Y agregar al final del archivo:

```ts
// ── Vínculo con Claude (MCP remoto, conversación, importación) ───────────

// URL base pública de la app. Mismo default que lib/daily-report.ts: si algún
// día se separan, el mail y el conector apuntarían a hosts distintos.
function appUrl(): string {
  return (process.env.APP_URL ?? "https://severo-tronador.vercel.app").replace(/\/$/, "");
}

// URL del conector MCP del proyecto: la genera un owner y se muestra UNA vez
// (contiene el token). Regenerarla invalida la anterior.
export async function generarUrlMcp(): Promise<{ url: string }> {
  const { id: projectId } = await requireMember("owner");
  const token = await issueMcpToken(projectId);
  return { url: mcpUrl(appUrl(), token) };
}

// Conversación de claude.ai vinculada al proyecto. Vacío desvincula.
export async function vincularConversacion(formData: FormData) {
  const { id: projectId } = await requireMember("editor");
  const raw = String(formData.get("conversationUrl") ?? "").trim();
  const current = await readClaudeLink(projectId);
  if (!raw) {
    const { conversationUrl: _drop, linkedAt: _drop2, ...resto } = current;
    await saveClaudeLink(projectId, resto);
    revalidatePath("/escucha");
    redirect("/escucha?tab=informe&claude=1");
  }
  if (!isClaudeConversationUrl(raw)) redirect("/escucha?tab=informe&claude_error=url");
  await saveClaudeLink(projectId, { ...current, conversationUrl: raw, linkedAt: new Date().toISOString() });
  revalidatePath("/escucha");
  redirect("/escucha?tab=informe&claude=1");
}

// Importar un informe escrito afuera: archivo .md/.html o texto pegado. Se
// decide html vs markdown por la extensión del archivo y, si no hay archivo,
// por si el texto arranca con "<".
export async function importarInforme(formData: FormData) {
  const { id: projectId } = await requireMember("editor");
  const archivo = formData.get("archivo");
  const pegado = String(formData.get("texto") ?? "");
  const enviarMail = formData.get("enviarMail") !== null;

  let contenido = "";
  let esHtml = false;
  if (archivo instanceof File && archivo.size > 0) {
    contenido = await archivo.text();
    esHtml = /\.html?$/i.test(archivo.name);
  } else {
    contenido = pegado;
  }
  const t = contenido.trim();
  if (!t) redirect("/escucha?tab=informe&informe_error=vacio");
  if (contenido.length > MAX_IMPORT_CHARS) redirect("/escucha?tab=informe&informe_error=grande");
  // Un HTML pegado a mano arranca con <!doctype o con una etiqueta.
  if (!esHtml && t.startsWith("<")) esHtml = true;

  try {
    const link = await readClaudeLink(projectId);
    await importReport(projectId, {
      markdown: esHtml ? undefined : t,
      html: esHtml ? contenido : undefined,
      origen: "import",
      conversationUrl: link.conversationUrl,
      enviarMail,
    });
  } catch (e) {
    log.warn("escucha.import_failed", { projectId, error: (e as Error).message });
    redirect(`/escucha?tab=informe&informe_error=${encodeURIComponent((e as Error).message.slice(0, 200))}`);
  }
  revalidatePath("/escucha");
  redirect("/escucha?tab=informe&importado=1");
}
```

> **Ojo con `redirect()` adentro de `try`**: `redirect()` funciona lanzando. El `redirect` del catch está bien porque está en el `catch`, pero el de éxito **tiene que quedar fuera del `try`** (como está arriba) o el propio `try` lo atraparía y lo convertiría en `informe_error`.

- [ ] **Step 4: Implementación — componentes**

```tsx
// components/escucha/mcp-url-button.tsx
"use client";

// Genera la URL del conector MCP y la muestra UNA vez para copiar (contiene el
// token). Regenerarla invalida la anterior — mismo patrón que
// ExtensionTokenButton. Solo owner.
//
// Este archivo es "use client": exporta SOLO el componente, nada más, porque lo
// consume un server component.

import { useState, useTransition } from "react";
import { generarUrlMcp } from "@/app/(dashboard)/escucha/actions";

export function McpUrlButton() {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            try {
              const r = await generarUrlMcp();
              setUrl(r.url);
            } catch {
              setError("No se pudo generar (¿sos owner del proyecto?)");
            }
          })
        }
        className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {pending ? "Generando…" : url ? "Regenerar URL del conector" : "Generar URL del conector"}
      </button>
      {url && (
        <div className="space-y-1">
          <code className="block break-all rounded-md border border-zinc-200 bg-zinc-50 p-2 font-mono text-[11px] text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            {url}
          </code>
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Copiala ahora: no se vuelve a mostrar. Lleva el token adentro, así
            que es una credencial: no la pegues en un chat compartido.
            Regenerarla invalida la anterior.
          </p>
        </div>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
```

```tsx
// components/escucha/claude-link-card.tsx
// Tarjeta "Claude" del tab Informe: URL del conector MCP, conversación
// vinculada, estado del canal e importación de un informe escrito afuera.
//
// Server component: los pedazos interactivos viven en archivos "use client"
// propios (McpUrlButton) o son forms con server actions.
import { vincularConversacion, importarInforme } from "@/app/(dashboard)/escucha/actions";
import { SubmitButton, FormStatus } from "@/components/ui/submit-button";
import { McpUrlButton } from "@/components/escucha/mcp-url-button";
import { TOOL_NAMES } from "@/lib/mcp/tools";
import type { ClaudeLink } from "@/lib/claude-link";

function haceCuanto(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "recién";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} días`;
}

const fechaCorta = (iso: string): string =>
  new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });

export function ClaudeLinkCard({
  link,
  params,
}: {
  link: ClaudeLink;
  params: Record<string, string | undefined>;
}) {
  const estado = [
    link.lastToolAt ? `Última llamada: ${haceCuanto(link.lastToolAt)}` : "Todavía no llamó ninguna tool",
    link.client ? link.client : null,
    link.lastReportAt ? `último informe importado: ${fechaCorta(link.lastReportAt)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="space-y-4 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <div>
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Claude</h2>
        <p className="mt-1 max-w-[70ch] text-xs text-zinc-500">
          Tronador expone este proyecto como servidor MCP: Claude lee el brief,
          las métricas medidas, las menciones y los informes anteriores, propone
          actualizaciones del brief y guarda el informe que escriban juntos —con
          mail y PDF a los owners— sin que tengas que re-explicarle el cliente
          en cada sesión.
        </p>
      </div>

      <FormStatus
        ok={
          params.claude === "1"
            ? "Conversación guardada."
            : params.importado === "1"
              ? "Informe importado: quedó en el historial y salió el mail con el PDF."
              : null
        }
        error={
          params.claude_error === "url"
            ? "La URL tiene que ser de claude.ai (https://claude.ai/…)."
            : params.informe_error === "vacio"
              ? "Subí un archivo o pegá el texto del informe."
              : params.informe_error === "grande"
                ? "El informe supera los 400.000 caracteres."
                : params.informe_error
                  ? "No se pudo importar el informe."
                  : null
        }
        detalle={params.informe_error && !["vacio", "grande"].includes(params.informe_error) ? params.informe_error : null}
      />

      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">Conector</h3>
        <ol className="max-w-[70ch] list-decimal space-y-1 pl-5 text-xs text-zinc-500">
          <li>Generá la URL (solo owner) y copiala: se muestra una sola vez.</li>
          <li>
            En claude.ai: Configuración › Conectores › Agregar conector
            personalizado › pegá la URL › <strong>sin autenticación</strong>.
          </li>
          <li>
            En Claude Code: <code>claude mcp add --transport http tronador &lt;url&gt;</code>
          </li>
        </ol>
        <McpUrlButton />
        <p className="max-w-[70ch] text-[11px] text-zinc-500">
          Tools disponibles: {TOOL_NAMES.join(", ")}. Ninguna ejecuta barridos ni
          edita el escenario: eso se sigue aplicando desde la pestaña Escenario.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">Conversación vinculada</h3>
        <form action={vincularConversacion} className="flex flex-wrap items-center gap-2">
          <label htmlFor="conversationUrl" className="sr-only">
            URL de la conversación de claude.ai
          </label>
          <input
            id="conversationUrl"
            name="conversationUrl"
            type="url"
            defaultValue={link.conversationUrl ?? ""}
            placeholder="https://claude.ai/chat/…"
            className="min-w-[280px] flex-1 rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <SubmitButton variant="secondary" pendingLabel="Guardando…">
            Guardar
          </SubmitButton>
          {link.conversationUrl && (
            <a
              href={link.conversationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[oklch(52%_0.13_255)] underline-offset-2 hover:underline"
            >
              Abrir en claude.ai →
            </a>
          )}
        </form>
        <p className="text-[11px] text-zinc-500">{estado}</p>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">Importar informe</h3>
        <form action={importarInforme} className="space-y-2">
          <input
            type="file"
            name="archivo"
            accept=".md,.markdown,.html,.htm,text/markdown,text/html"
            className="block text-xs text-zinc-600 file:mr-3 file:rounded file:border file:border-zinc-300 file:bg-transparent file:px-2 file:py-1 file:text-xs dark:text-zinc-300 dark:file:border-zinc-700"
          />
          <label htmlFor="texto" className="sr-only">
            Pegar el informe
          </label>
          <textarea
            id="texto"
            name="texto"
            rows={4}
            placeholder="…o pegá acá el Markdown o el HTML del informe"
            className="w-full rounded border border-zinc-300 px-2 py-1.5 font-mono text-[12px] dark:border-zinc-700 dark:bg-zinc-900"
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
              <input type="checkbox" name="enviarMail" defaultChecked className="accent-[oklch(52%_0.13_255)]" />
              Enviar por mail a los owners (con PDF)
            </label>
            <SubmitButton variant="secondary" pendingLabel="Importando…">
              Importar informe
            </SubmitButton>
          </div>
        </form>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Implementación — panel e página**

En `components/escucha/informe-panel.tsx`: agregar los imports, el badge de origen, y la tarjeta.

Reemplazar el bloque de imports por:

```tsx
import Link from "next/link";
import { generarInformeAhora } from "@/app/(dashboard)/escucha/actions";
import { SubmitButton, FormStatus } from "@/components/ui/submit-button";
import { ExtensionTokenButton } from "@/components/escucha/extension-token-button";
import { ClaudeLinkCard } from "@/components/escucha/claude-link-card";
import { ReportView } from "@/components/escucha/report-view";
import type { DailyReport } from "@/lib/daily-report";
import type { ClaudeLink } from "@/lib/claude-link";
```

Agregar, después de la función `fecha`:

```tsx
// De dónde salió el informe. Los guardados antes de que existiera el campo son
// de Tronador: ese es el default, no "desconocido".
const ORIGEN_LABEL: Record<NonNullable<DailyReport["origen"]>, string> = {
  tronador: "Tronador",
  "claude-chrome": "Claude",
  import: "Importado",
};

function OrigenBadge({ report }: { report: DailyReport }) {
  const origen = report.origen ?? "tronador";
  const accent =
    origen === "tronador"
      ? "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
      : "border-[oklch(52%_0.13_255)]/40 text-[oklch(52%_0.13_255)]";
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] ${accent}`}>
      {ORIGEN_LABEL[origen]}
    </span>
  );
}

function ConversacionLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[11px] text-[oklch(52%_0.13_255)] underline-offset-2 hover:underline"
    >
      conversación →
    </a>
  );
}
```

Reemplazar la firma del componente y el encabezado del último informe:

```tsx
export function InformePanel({
  latest,
  history,
  generado,
  claude,
  params,
}: {
  latest: DailyReport | null;
  history: DailyReport[];
  generado: boolean;
  claude: ClaudeLink;
  params: Record<string, string | undefined>;
}) {
```

Dentro del `<section>` del estado, reemplazar el bloque del último informe para que muestre origen y conversación:

```tsx
        <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
          {latest ? (
            <>
              <span>
                Último informe:{" "}
                <span className="font-mono tabular-nums">{fecha(latest.at)}</span>
                {" · "}
                <span className="font-mono tabular-nums">{latest.items24h}</span>{" "}
                menciones 24h
              </span>
              <OrigenBadge report={latest} />
              {latest.conversationUrl && <ConversacionLink url={latest.conversationUrl} />}
            </>
          ) : (
            "Todavía no hay informes. El cron corre todos los días a las 09:00; también podés generar uno ahora, o importar el que hayas escrito con Claude."
          )}
        </div>
```

En el `<summary>` del historial, agregar el badge y el link:

```tsx
                  <summary className="cursor-pointer text-xs text-zinc-600 dark:text-zinc-300">
                    <span className="font-mono tabular-nums">{fecha(r.at)}</span>
                    {" · "}
                    {r.items24h} menciones
                    {r.titulo ? ` · ${r.titulo}` : ""}{" "}
                    <OrigenBadge report={r} />
                    {r.conversationUrl && <> <ConversacionLink url={r.conversationUrl} /></>}
                  </summary>
```

Y agregar la tarjeta justo antes de la sección "Extensión de Chrome":

```tsx
      <ClaudeLinkCard link={claude} params={params} />
```

En `app/(dashboard)/escucha/page.tsx`: agregar el import y pasar las props nuevas.

```tsx
import { readClaudeLink } from "@/lib/claude-link";
```

```tsx
      ) : tab === "informe" ? (
        <InformePanel
          {...await readDailyReports(projectId)}
          generado={params.generado === "1"}
          claude={await readClaudeLink(projectId)}
          params={params}
        />
```

- [ ] **Step 6: Correr los tests — tienen que pasar**

```bash
npx vitest run tests/escucha-claude-actions.test.ts tests/escucha-brief-actions.test.ts tests/escucha-bloques-actions.test.ts tests/design-system.test.ts
npx tsc --noEmit
npx eslint "app/(dashboard)/escucha/actions.ts" "app/(dashboard)/escucha/page.tsx" components/escucha/claude-link-card.tsx components/escucha/mcp-url-button.tsx components/escucha/informe-panel.tsx tests/escucha-claude-actions.test.ts
npx next build
```

El `next build` es el que atrapa una violación de la frontera RSC (un `"use client"` exportando algo que no es componente, o un server component importando código de cliente).

- [ ] **Step 7: Suite completa**

```bash
npx vitest run
```

- [ ] **Step 8: Commit**

```bash
git add -- "app/(dashboard)/escucha/actions.ts" "app/(dashboard)/escucha/page.tsx" components/escucha/claude-link-card.tsx components/escucha/mcp-url-button.tsx components/escucha/informe-panel.tsx tests/escucha-claude-actions.test.ts && git commit -m "feat: tarjeta Claude en el panel Informe (conector, conversación, importación)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XW7g7dSqmfsaVwruSZ87N8" -- "app/(dashboard)/escucha/actions.ts" "app/(dashboard)/escucha/page.tsx" components/escucha/claude-link-card.tsx components/escucha/mcp-url-button.tsx components/escucha/informe-panel.tsx tests/escucha-claude-actions.test.ts
```

---

### Task 6: Deploy + smoke con el informe real del 26/08

**Depende de:** todo lo anterior mergeado.

**Files:** ninguno (verificación end-to-end)

- [ ] **Step 1: Verificación previa al deploy**

```bash
npx vitest run
npx tsc --noEmit
npx eslint
npx next build
```

Los cuatro tienen que pasar. `next build` tiene que listar `/api/mcp/[token]/[transport]`.

- [ ] **Step 2: Deploy y generación de la URL**

- [ ] Deploy a producción (Vercel).
- [ ] Confirmar que `APP_URL` está seteada en el entorno de producción; si no, la URL generada apunta al default y el conector conecta al proyecto equivocado.
- [ ] En el proyecto **Ferro**, ir a Escucha › Informe › tarjeta Claude, apretar **Generar URL del conector** y copiar la URL. Guardarla en el gestor de contraseñas: no se vuelve a mostrar.
- [ ] Verificar a mano que la URL con un token adulterado (cambiarle un carácter al secreto) devuelve **404** y no 401:
  ```bash
  curl -si -X POST "https://<app>/api/mcp/<projectId>.<secreto-adulterado>/mcp" -H "content-type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -1
  ```

- [ ] **Step 3: Conector en claude.ai (Max)**

- [ ] claude.ai › Configuración › Conectores › **Agregar conector personalizado** › pegar la URL › **sin autenticación**.
- [ ] Confirmar que el conector aparece conectado y lista las 10 tools: `get_project`, `get_brief`, `propose_brief_updates`, `get_metrics`, `get_recent_items`, `get_run_status`, `list_reports`, `get_report`, `save_report`, `link_conversation`.

- [ ] **Step 4: Smoke con Claude in Chrome**

- [ ] Abrir la conversación de Ferro en Claude in Chrome.
- [ ] Pedirle a Claude que llame `link_conversation` con la URL de esa conversación. Verificar en el panel que aparece la conversación vinculada y el link "Abrir en claude.ai".
- [ ] `get_brief` → tiene que devolver el **brief maestro v1.1** más los aportes, no el brief vacío.
- [ ] `get_project` → nombre "Ferro", zona, hitos en días, cuentas por categoría.
- [ ] `save_report` con el **HTML del informe del 26/08** (`informeferro20260826.html`). Verificar:
  - [ ] Aparece en el historial del panel con badge **Claude** y el link a la conversación.
  - [ ] El cuerpo renderizado tiene las secciones `01…`, la bajada destacada, el bloque de KPIs como tarjetas, los párrafos de Inferencia/Advertencia como callouts y las tablas como tablas.
  - [ ] La cuenta regresiva es la del **calendario de Tronador**, no la del HTML (las tarjetas del documento se descartaron).
  - [ ] Llega el mail a los owners con el **PDF adjunto** y el PDF abre bien.
  - [ ] Si el informe traía `briefUpdates`, quedaron como **propuestas pendientes** en Escucha › Escenario, y el maestro sigue igual.
- [ ] Repetir `save_report` con `enviarMail: false` y confirmar que guarda sin mandar mail.

- [ ] **Step 5: Smoke desde Claude Code**

```bash
claude mcp add --transport http tronador "https://<app>/api/mcp/<token>/mcp"
```

- [ ] En una sesión de Claude Code, llamar `get_metrics` y verificar que devuelve las cuentas del plan con seguidores/amplificación/adhesión/densidad.
- [ ] Verificar en el panel que el estado dice **"Última llamada: recién · claude-code …"** (el `client` cambia respecto de la sesión de Chrome).

- [ ] **Step 6: Rotación**

- [ ] Apretar **Regenerar URL del conector**. Verificar que la URL vieja pasa a devolver **404** y que hay que reconfigurar el conector en claude.ai con la nueva.

- [ ] **Step 7: Importación desde el panel**

- [ ] Escucha › Informe › Importar informe: subir `informeferro20260826.html`, destildar "Enviar por mail". Verificar que entra al historial con badge **Importado** y sin mail.
- [ ] Probar el camino de error: pegar texto sin secciones (`solo una línea suelta` no alcanza: usar `<script>x</script>`) y confirmar que vuelve con `informe_error` visible en la tarjeta y **sin** guardar nada.

---

## Self-review

Antes de dar la implementación por terminada:

- [ ] **Cobertura de la spec.** Recorrer `docs/superpowers/specs/2026-08-28-mcp-claude-chrome-design.md` decisión por decisión: §1 servidor MCP + token en la URL + rotación + rate limit; §2 `claude-link:<pid>` con los 5 campos; §3 las 10 tools con las firmas que dice la spec; §4 importación (kpi, countdown descartado, inf/callout, bajada, script/style/nav fuera, `parseReportMarkdown` tolerante, sin h1 → título, `origen`/`conversationUrl`/`titulo`, `splitReport`, mail salvo `enviarMail=false`, límite 400.000); §5 panel (URL una vez, instrucciones de claude.ai y Claude Code, conversación con Guardar y link, estado, formulario de importación con checkbox, badge de origen en el historial); §Errores (404 / 429 / sin markdown ni html / 0 bloques / mail falla / URL que no es claude.ai). Cada punto tiene que apuntar a un archivo y a un test.
- [ ] **Barrido de placeholders.** `grep -rn "TODO\|FIXME\|XXX\|placeholder\|\.\.\." lib/mcp lib/report-import.ts lib/mcp-token.ts lib/claude-link.ts components/escucha/claude-link-card.tsx components/escucha/mcp-url-button.tsx "app/api/mcp"` — cero resultados que no sean elipsis de texto en español visible al usuario.
- [ ] **Consistencia de tipos.** `DailyReport` tiene exactamente `origen`/`conversationUrl`/`titulo` y todos los productores los llenan: `generateDailyReport` pone `origen: "tronador"` + `titulo`; `importReport` pone `origen` del input + `titulo` + `conversationUrl`. Los consumidores (`informe-panel`, `list_reports`, `get_report`) tratan `origen` ausente como `"tronador"` y `titulo` ausente como `"(sin título)"` — nunca `undefined` renderizado.
- [ ] **Nombres de tools idénticos en tres lugares.** `TOOL_NAMES` en `lib/mcp/tools.ts` = el array que asserta `tests/mcp-tools.test.ts` = el texto de ayuda de `components/escucha/claude-link-card.tsx` (que lo importa de `TOOL_NAMES`, así que no puede divergir) = la lista del Step 3 del smoke.
- [ ] **Frontera RSC.** `components/escucha/mcp-url-button.tsx` tiene `"use client"` en la línea 1 y exporta **solo** `McpUrlButton`. `components/escucha/claude-link-card.tsx` **no** tiene `"use client"` y no exporta nada que no sea componente. `next build` pasa.
- [ ] **Nada de `projectId` en las tools.** Ningún `inputSchema` tiene una clave `projectId` (hay un test que lo asserta) y ninguna descripción de tool le pide al modelo que mande el proyecto.
- [ ] **El token nunca se loguea entero.** `grep -rn "token" "app/api/mcp" lib/mcp-token.ts | grep -i "log\."` — solo `tokenTag(token)`.
- [ ] **Middleware.** `api/mcp` está en el negative lookahead del matcher; sin eso todo el conector se va a `/api/auth/signin`.
- [ ] **`redirect()` fuera del `try`.** En `importarInforme`, el redirect de éxito está después del bloque `try/catch`, no adentro.
