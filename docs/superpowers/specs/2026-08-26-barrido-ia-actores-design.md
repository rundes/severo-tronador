# Barrido con IA: búsquedas ejecutadas, candidatos clasificados, historias vivas

**Fecha:** 2026-08-26 · **Estado:** aprobado (diseño) · **Ámbito:** `infra/escucha-extension/*`, `app/api/extension/*`, `lib/monitor-metrics.ts`, `lib/client-brief.ts`, nuevo `lib/candidate-ai.ts`. Sin DDL.
**Sub-proyecto 1 de 3** (luego: informe editorial; diseño + identidad por proyecto). Referencia de calidad: `~/Downloads/informeferro20260825.html` (informe hecho a mano con Claude in Chrome).

## Problema

El informe diario no puede parecerse al de referencia porque no tiene datos: la extensión
solo recorre las cuentas del plan (2 institucionales en Ferro), **nunca ejecuta las búsquedas
A/B**, y para X/FB/TikTok lee el DOM de la home de la plataforma **sin navegar al perfil**
(captura basura). No hay descubrimiento de actores: las cuentas que importan (listas,
medios partidarios, cuentas de socios) solo entran si el operador ya las conoce.

## Decisiones

- **Navegar de verdad**: cada cuenta X/FB/TikTok se abre en su URL de perfil antes de leer el
  DOM. Instagram sigue por API interna (solo lectura).
- **Las búsquedas A/B se ejecutan** en IG (topsearch, solo lectura) y X (búsqueda "Latest",
  DOM); FB `search/posts` (DOM). Producen items y **candidatos** (cuentas vistas).
- **La IA clasifica candidatos en el server** (Claude, un llamado por lote) con el brief y el
  escenario como contexto. Los relevantes entran a *Actores sugeridos*; el operador incorpora
  con un click (flujo existente). Nunca automático (§9.2). Los descartados no se re-proponen.
- **Historias vivas** se calculan server-side desde `meta.expiringAt`.
- Fuera de alcance: búsquedas en TikTok, comentarios, auto-incorporar, cambios al informe.

## Extensión

### `core/nav.js` (nuevo, puro, testeable)

```js
export function profileUrl(platform, handle)   // x → https://x.com/<h> · facebook → https://www.facebook.com/<h> · tiktok → https://www.tiktok.com/@<h> · instagram → https://www.instagram.com/<h>/
export function searchUrl(platform, query)     // x → https://x.com/search?q=<enc>&src=typed_query&f=live · facebook → https://www.facebook.com/search/posts?q=<enc> · instagram → null (API) · tiktok → null (fuera de alcance)
export function candidatesFromIgSearch(json, query)   // topsearch → [{platform:"instagram", handle, displayName, followers?, sample:[]}]
export function candidatesFromItems(items, query)     // agrupa items X/FB por author → [{platform, handle, sample:[{url,text,at}]}]
export function mergeCandidates(lists)                // dedupe por platform:handle, une samples (máx 3)
```

### `sw.js`

- `tabFor(platform)` → `openIn(platform, url)`: reutiliza la pestaña de la plataforma pero la
  **navega** a `url` (`chrome.tabs.update`), espera `status === "complete"` + 2-4 s de jitter.
- Cuentas: `openIn(platform, profileUrl(...))` y luego `dom-collect` (X/FB/TikTok); IG igual que hoy.
- Búsquedas (después de las cuentas, con el presupuesto que quede): por cada término de
  `plan.searches.a` y `.b`:
  - IG: `ig-search` (content) → `topsearch` → items vacíos, candidatos por `candidatesFromIgSearch`.
  - X/FB: `openIn(platform, searchUrl(...))` + `dom-collect` con `{ query }` → items (con
    `author` extraído del DOM) → candidatos por `candidatesFromItems`.
  - Cada búsqueda gasta 1 request del presupuesto de su plataforma.
- Al final: `POST /api/extension/items` (items) y `POST /api/extension/candidates`
  (`{ candidates, searches: { a, b } }`, máx 60). Estado en `runStatus`:
  `{ cuentas, busquedas, candidatos, sugeridos }`.
- Cuentas ya en el plan y candidatos de tandas anteriores se filtran server-side (no en el plugin).

### `content.js`

- `dom-collect` acepta `{ handle?, query? }`; `domX`/`domFacebook` extraen `author` del
  artículo (X: `a[href^="/"]` del `User-Name`; FB: primer `strong a` / `h3 a`) y lo devuelven en
  cada item; si viene `handle`, se usa como `author` por defecto.
- `ig-search`: `GET /api/v1/web/search/topsearch/?context=blended&query=<q>` (lectura; pasa la
  lista negra) → devuelve `{ status, body, users: [{username, full_name, follower_count?, is_verified}] }`.
- TikTok: sin cambios (perfil por DOM).

### Panel

`panel.html/js`: además de "menciones nuevas": `cuentas relevadas · búsquedas · candidatos → sugeridos`.

## Server

### `POST /api/extension/candidates` (nuevo)

Auth por token de extensión. Body zod:

```ts
{ candidates: [{ platform: "instagram"|"x"|"facebook"|"tiktok", handle: string(1..80), displayName?: string, followers?: int, bio?: string(≤300), sample: [{ url: url, text: string(≤500), at?: string }] (≤3) }] (≤60),
  searches?: { a: string[], b: string[] } }
```

Flujo: normalizar handles → quitar los que ya están en `monitor.accounts` o en
`brief.suggestions` (cualquier estado) → si quedan 0, `{ ok, evaluated: 0, suggested: 0 }` →
`classifyCandidates(projectId, candidates)` → `mergeSuggestions(brief, relevantes, accounts, now)` con
`origen: "barrido"` → `saveClientBrief` → `{ ok, evaluated, suggested }`. Errores de Claude → 502
`{ error: "ai_failed" }` con log; nada se guarda.

### `lib/candidate-ai.ts` (nuevo)

`classifyCandidates(projectId, candidates): Promise<ActorSuggestionInput[]>`

- Prompt: system = reglas editoriales (hecho vs inferencia, §9.2 no atribuir sin evidencia) +
  "Devolvé SOLO un bloque ```json```". User = brief (`briefText`) + escenario (cuentas con
  categoría, búsquedas A/B, entidades, `noRepetir`) + lista de candidatos numerada con
  `platform`, `handle`, `displayName`, `followers`, `bio`, muestras (url, texto, fecha) +
  esquema: `{ "candidatos": [{ "i": n, "relevante": bool, "category": …, "direccion": "A|B|?", "razon": "≤200 chars", "evidencia": "url de una muestra" }] }`.
- Reglas: `relevante` solo si la cuenta habla del conflicto/territorio del brief o es un actor
  con capacidad de incidir (medio, agrupación, dirigente); cuentas genéricas (memes, comercios
  ajenos) no; `direccion` solo con evidencia textual, si no `"?"`; `evidencia` debe ser una
  de las URLs dadas.
- Parseo tolerante (mismo `extractJsonCandidate` de `scenario-ai`); candidato con índice
  inválido o categoría fuera de la taxonomía se descarta individualmente; `evidencia` que no
  sea una URL de sus muestras se reemplaza por la primera muestra.
- `maxTokens` 1500; `incrementUsage` como los otros usos de Claude.

### `lib/client-brief.ts`

`ActorSuggestion` suma `origen?: "informe" | "barrido"`, `followers?: number`, `displayName?: string`.
`mergeSuggestions` conserva esos campos. `actor-suggestions.tsx` muestra origen y seguidores.

### `lib/monitor-metrics.ts`

`AccountMetrics` suma `historiasVivas: number` (items `kind === "story"` con
`meta.expiringAt > now`) y `ultimaPieza: { url, text, likeCount?, at } | null` (post/reel más
reciente). `daily-report` los pasa al prompt en la línea por cuenta (`hist:N`).

## Errores

- Plataforma enfriada por el breaker → se saltean sus cuentas **y** sus búsquedas.
- Búsqueda que no carga (timeout 20 s) → se registra en `runStatus.errores`, sigue.
- Claude falla → candidatos de esa corrida se pierden (se re-capturan mañana); el resto del
  barrido ya subió sus items.
- Token inválido → 403 como el resto de `/api/extension/*`.

## Testing (vitest)

- `tests/extension-nav.test.ts` (importa `infra/escucha-extension/core/nav.js`): URLs por
  plataforma, `candidatesFromIgSearch` con fixture de topsearch, `candidatesFromItems` agrupa
  y limita muestras, `mergeCandidates` dedupe.
- `tests/candidate-ai.test.ts`: prompt incluye brief/escenario/candidatos; parseo válido;
  índice inválido descartado; evidencia fuera de muestras → primera muestra; JSON roto → throw.
- `tests/extension-candidates-route.test.ts`: 403 sin token; filtra los ya conocidos; llama a
  `classifyCandidates` solo con los nuevos; guarda sugerencias con `origen: "barrido"`; 502 si la IA falla.
- `tests/monitor-metrics.test.ts` (nuevo si no existe): `historiasVivas` cuenta solo vigentes; `ultimaPieza`.
- `tests/client-brief.test.ts`: `mergeSuggestions` conserva `origen/followers/displayName`.
