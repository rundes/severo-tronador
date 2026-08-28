# Vínculo con Claude (in Chrome, Desktop, Code): MCP remoto por proyecto, conversación vinculada e importación de informes

**Fecha:** 2026-08-28 · **Estado:** aprobado (diseño) · **Ámbito:** nuevo `app/api/mcp/[token]/[transport]/route.ts`, `lib/mcp/*`, `lib/mcp-token.ts`, `lib/report-import.ts`, `lib/daily-report.ts` (campos de origen), panel Escucha › Informe (tarjeta "Claude"), `app/(dashboard)/escucha/actions.ts`. Sin DDL (todo en `conector_config`).

## Problema

Los informes que el operador produce a mano con Claude in Chrome (p. ej. `informeferro20260826.html`) quedan en Descargas: no entran al historial, no salen por mail/PDF, no proponen actualizaciones al brief y no alimentan la memoria del proyecto. A la inversa, cada sesión de Claude arranca sin el brief vigente ni las métricas medidas por Tronador. El plugin de Claude no expone API, así que la única vía es que **Tronador sea la memoria** y la exponga por un canal que Claude entiende: un servidor MCP remoto.

## Decisiones

1. **Un servidor MCP remoto por proyecto**, servido por Next en `https://<app>/api/mcp/<token>/mcp` (Streamable HTTP, paquete `mcp-handler` 2.x de Vercel, sin Redis: no se habilita SSE). El token es `<projectId>.<secreto>` con el mismo mecanismo que el de la extensión (`lib/mcp-token.ts`, fila `mcp-token:<pid>`, solo SHA-256 guardado, plaintext una vez). El token va en la URL porque los conectores personalizados de claude.ai no permiten cabeceras propias y OAuth queda fuera de alcance; mitigación: rotación desde el panel, sin logging de la URL completa, rate limit 60 req/min por token; el path queda en los logs de acceso de la plataforma (riesgo residual, mitigado por rotación).
2. **Conversación vinculada.** `conector_config` `claude-link:<pid>` = `{ conversationUrl?, linkedAt?, lastToolAt?, lastReportAt?, client? }`. Se completa de dos formas: el operador pega la URL de la conversación (`https://claude.ai/chat/<uuid>`) en la tarjeta del panel, o Claude llama `link_conversation({ conversationUrl })` desde la propia conversación. `lastToolAt`/`client` se actualizan en cada llamada (el `clientInfo` del handshake MCP dice si es Claude in Chrome, Desktop o Code).
3. **Tools** (todas resuelven el proyecto por el token; nunca reciben `projectId`):
   - `get_project()` → nombre, zona, conversación vinculada, hitos en días, cuentas por categoría, versión/hash del brief, fecha del último informe.
   - `get_brief()` → brief maestro + aportes (el mismo `briefText`) y las propuestas pendientes.
   - `propose_brief_updates({ updates: [{ seccion, texto }] })` → `mergeBriefUpdates` (mismo camino que el informe diario; nunca edita el maestro).
   - `get_metrics({ days = 7 })` → `accountMetrics` (seguidores, amp, adh, densidad, historias, última pieza, muestra de comentarios anonimizada).
   - `get_recent_items({ hours = 24, limit = 100, source? })` → menciones del cache (fuente, autor, texto, url, fecha, métricas).
   - `get_run_status()` → última corrida de la extensión (`readExtensionRun`).
   - `list_reports({ limit = 10 })` → `{ at, titulo, origen, items24h }`; `get_report({ at })` → markdown.
   - `save_report({ markdown?, html?, titulo?, at?, notaOperativa?, briefUpdates?, enviarMail = true })` → importa (decisión 4) y devuelve `{ at, titulo, secciones, briefUpdates, mailSent }`.
   - `link_conversation({ conversationUrl })`.
   Ninguna tool ejecuta barridos ni edita configuración del monitor: el escenario se sigue aplicando desde el panel.
4. **Importación de informes** (`lib/report-import.ts`, usada por la tool y por el formulario del panel): acepta Markdown o HTML. HTML → Markdown con `turndown` + `turndown-plugin-gfm` (tablas), con reglas propias para el informe de referencia: `.kpi/.kpis` → bloque ```` ```kpi ````, `.cd/.cdc` (cuenta regresiva) → texto (el countdown lo escribe el código desde los hitos), `.inf/.callout` → párrafo `**Inferencia**`/`**Advertencia**`, `.bajada` → párrafo tras el `h1`, `<script>/<style>/<nav>` descartados. El resultado pasa por `parseReportMarkdown` (ya tolerante); si no hay `h1`, `titulo` o la primera línea se convierte en `# título`. Se guarda como `DailyReport` con `origen: "claude-chrome" | "import"`, `conversationUrl` (del vínculo), `titulo`, `items24h/items7d` del cache en ese momento, y se dispara `emailDailyReport` (mail HTML + PDF) salvo `enviarMail=false`. `briefUpdates` y el bloque ```` ```json ```` interno se procesan igual que en el informe generado (`splitReport`). Límite: 400.000 chars de entrada.
5. **Panel** (Escucha › Informe, tarjeta "Claude"): botón "Generar URL del conector" (muestra la URL completa una sola vez + instrucciones: claude.ai › Configuración › Conectores › Agregar conector personalizado › sin autenticación; Claude Code: `claude mcp add --transport http tronador <url>`), campo "Conversación vinculada" (URL) con Guardar y link "Abrir en claude.ai", estado "Última llamada: hace 5 min · Claude in Chrome · último informe importado: 26/08", formulario "Importar informe" (archivo `.md/.html` o pegar texto, checkbox "enviar por mail"). El historial del panel muestra el badge de origen (Tronador / Claude / Importado) y la conversación.
6. **Fuera de alcance:** OAuth para el conector, ejecutar barridos desde Claude, editar el escenario por MCP, guardar el HTML original (solo Markdown), Drive.

## Datos

```ts
interface DailyReport { …; origen?: "tronador" | "claude-chrome" | "import"; conversationUrl?: string; titulo?: string }
// conector_config
"mcp-token:<pid>"  → { hash }
"claude-link:<pid>" → { conversationUrl?: string; linkedAt?: string; lastToolAt?: string; lastReportAt?: string; client?: string }
```

## Errores

- Token inválido → 404 (no 401, para no confirmar la existencia del endpoint). Rate limit → 429.
- `save_report` sin `markdown` ni `html`, o sin ninguna sección reconocible (`parseReportMarkdown` devuelve 0 bloques) → error MCP con mensaje claro; nada se guarda.
- Mail que falla → el informe queda guardado; `mailSent: false` con el motivo.
- `conversationUrl` que no sea `https://claude.ai/...` → rechazada.

## Testing (vitest)

- `tests/mcp-token.test.ts`: emitir/verificar/rotar; formato inválido → null.
- `tests/mcp-tools.test.ts`: cada tool como función pura con libs mockeadas (proyecto, brief, métricas, items, run, reports, save_report → llama a `importReport`, `link_conversation` valida URL).
- `tests/report-import.test.ts`: Markdown directo; HTML de referencia (`fixtures/informe-ferro.html`, versión recortada) → h1, bajada, secciones `## 0N`, tabla, kpi, callout; sin h1 → título; `<script>` fuera; límite de tamaño.
- `tests/mcp-route.test.ts`: token inválido → 404; válido → delega en el handler (mock de `mcp-handler`).
- `tests/escucha-claude-actions.test.ts`: `vincularConversacion` (valida URL), `importarInforme` (archivo y texto, límite, redirect con `informe_error`).
- Smoke: agregar el conector en claude.ai (Max), abrir Claude in Chrome en la conversación de Ferro, `get_brief` devuelve el maestro v1.1, `save_report` con el HTML del 26/08 → aparece en el historial con badge Claude, llega el mail con PDF, propuestas de brief pendientes; desde Claude Code `claude mcp add` + `get_metrics`.
