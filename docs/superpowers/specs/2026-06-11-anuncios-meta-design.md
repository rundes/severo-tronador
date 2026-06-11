# Anuncios Meta — diseño

**Fecha:** 2026-06-11
**Estado:** aprobado en brainstorming, pendiente de revisión del spec
**Inspiración de requerimiento:** metamize.xyz (app que automatiza creación de ads de video en Meta Ads + "Biblioteca de Anuncios" con rendimiento).

## Problema

severo-tronador ya genera contenido (Estudio) y publica/promociona (Difusión), pero no permite:

1. **Ver mis anuncios actuales de Meta Ads** con su preview real y su rendimiento, ni accionar sobre ellos.
2. **Previsualizar y crear** las propuestas del Estudio como **anuncios Meta reales** (no solo copy + imagen/video sueltos).

Hoy `lib/meta.ts` tiene la Marketing API mínima (`promotePagePost`, `getInsights`) y `meta-ad-library.ts` lee ads **públicos de terceros** (transparencia), no los propios. Falta la gestión de los anuncios de la **cuenta propia**.

## Alcance (decidido en brainstorming)

- Las **dos** features en un solo spec.
- **Preview real de Meta** (iframe de la Marketing API), no card imitada.
- Galería: **lectura + pausar/activar** (sin automatizaciones tipo metamize; eso sería otro spec).
- Métricas en la card: **alcance, frecuencia, clics, CTR, gasto, CPC, CPM, CPA, conversiones** (ROAS afuera: la org hace relevamiento de opinión, no e-commerce).
- En el Estudio: **preview + crear ad PAUSED**, eligiendo cuenta → campaña → conjunto (con opción de **crear campaña/conjunto nuevos** al vuelo).
- **Todos los placements** disponibles en el preview (Feed, Story, Reel, Marketplace, columna derecha, etc.), con toggle.
- **Una sola** cuenta publicitaria (la de `META_AD_ACCOUNT_ID` del conector Meta).
- Ubicación: galería en **/difusion**; crear-ad en el **Estudio** (/publicaciones).

### Fuera de alcance

- Automatizaciones (pausar/escalar por reglas de CPA/ROAS).
- ROAS / eventos de compra.
- Google Drive como fuente de media (el Estudio ya genera media con IA).
- Multi-cuenta publicitaria.

## Arquitectura

Enfoque elegido (**A**): capa fina sobre la Marketing API, **mock-first**, previews renderizados server-side embebiendo el iframe propio de Meta. Token siempre server-only; mutaciones por server actions.

Enfoques descartados:
- **B (Meta JS SDK en cliente):** expone el token y suma dependencia.
- **C (connector tipo listening):** esto no es listening; duplicaría el plumbing de config.

### Módulos

```
lib/meta.ts          (existe)  → publicación orgánica + getInsights (se extiende getInsights)
lib/meta-ads.ts      (nuevo)   → gestión de ads vía Marketing API (mock-first)
app/(dashboard)/difusion/page.tsx        → + sección "Mis anuncios" (galería)
components/publicaciones/mis-anuncios.tsx (nuevo) → galería client (filtros + toggle estado)
components/publicaciones/ad-studio.tsx   → + panel "Anuncio Meta" (preview + crear)
app/(dashboard)/publicaciones/actions.ts → + server actions de ads
```

`lib/meta-ads.ts` se separa de `lib/meta.ts` porque este último ya ronda las 290 líneas y mezcla orgánico + Marketing API; la gestión de ads es un dominio propio (listar/medir/crear/previsualizar). Reusa `getMetaConfig()` y el patrón `MetaResult`/mock de `lib/meta.ts`.

## Unidades (lib/meta-ads.ts)

Todas mock-first: sin `token`/`adAccountId`, devuelven datos mock determinísticos (como `mockInsights`).

| Función | Hace | Endpoint |
|---|---|---|
| `listMyAds({datePreset, status})` | Lista ads de la cuenta + insights por ad; calcula CPA/conversiones desde `actions[]` | `GET act_X/ads?fields=name,status,effective_status,creative{id},adset{name,campaign{name}}` + `GET <ad>/insights` |
| `getAdPreview(adId, formats[])` | HTML del iframe de preview de un ad existente | `GET <adId>/previews?ad_format=F` |
| `setAdStatus(adId, 'PAUSED'\|'ACTIVE')` | Pausa/activa un ad | `POST <adId>` |
| `listCampaigns()` | Campañas de la cuenta (selector) | `GET act_X/campaigns?fields=name,objective,status` |
| `listAdsets(campaignId)` | Conjuntos de una campaña (selector) | `GET <campaignId>/adsets?fields=name,status` |
| `createCampaign({name, objective})` | Crea campaña PAUSED (flujo "crear nuevo") | `POST act_X/campaigns` |
| `createAdset({campaignId, name, dailyBudgetUsd, days, countries, nowMs})` | Crea conjunto PAUSED | `POST act_X/adsets` |
| `uploadAdImage(url)` | Sube imagen → `image_hash` | `POST act_X/adimages` |
| `uploadAdVideo(url)` | Sube video → `video_id` (poll hasta `ready`) | `POST act_X/advideos` + `GET <video_id>?fields=status` |
| `buildCreativeSpec(proposal, media, {pageId, link, cta})` | Arma `object_story_spec` (link_data o video_data) | — (puro) |
| `previewProposal(spec, formats[])` | HTML de preview de una propuesta aún sin ad | `GET act_X/generatepreviews?creative=spec&ad_format=F` |
| `createAdFromProposal({adsetId, spec, name})` | Crea `adcreative` + `ad` **PAUSED** en el conjunto | `POST act_X/adcreatives` + `POST act_X/ads` |

`getInsights` (en `lib/meta.ts`, rama `ad`) se extiende para traer también `frequency,cpc,cpm,actions,cost_per_action_type` y exponer **CPC, CPM, CPA, conversiones** además de lo actual. El mock se extiende en consecuencia.

### Tipos

```ts
type DatePreset = "today" | "yesterday" | "last_7d" | "last_30d" | "maximum";
type AdStatusFilter = "all" | "active" | "paused";

interface AdRow {
  id: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | string;       // configured status
  effectiveStatus: string;                      // effective_status de Meta
  campaign?: string;
  adset?: string;
  metrics: Metric[];                            // reusa Metric { label, value }
  mode: "mock" | "live";
}

// AdFormat: catálogo de ad_format soportados por generatepreviews/previews.
// "Todos los disponibles" = el set completo del catálogo.
type AdFormat =
  | "DESKTOP_FEED_STANDARD" | "MOBILE_FEED_STANDARD"
  | "INSTAGRAM_STANDARD" | "INSTAGRAM_STORY" | "INSTAGRAM_REELS"
  | "FACEBOOK_STORY" | "FACEBOOK_REELS"
  | "MARKETPLACE_MOBILE" | "RIGHT_COLUMN_STANDARD";

interface CreativeSpec {           // object_story_spec
  page_id: string;
  link_data?: { message?: string; link: string; image_hash?: string; call_to_action?: { type: string; value: { link: string } } };
  video_data?: { message?: string; video_id: string; call_to_action?: { type: string; value: { link: string } }; image_url?: string };
}
```

## Componentes / UI

### 1. Difusión — "Mis anuncios" (galería)

- Nueva `<section>` en `app/(dashboard)/difusion/page.tsx`, sobre o bajo el reporte puntual existente.
- Server component arma la lista con `listMyAds(datePreset, status)`; el client component `<MisAnuncios>` maneja filtros y el toggle de estado.
- **Filtros:** período (`DatePreset`) + estado (`AdStatusFilter`) **vía querystring** (mismo patrón que el reporte de rendimiento actual de Difusión: `<form method="get">` + re-render server-side).
- **AdCard** (estética `DESIGN.md`: zinc + acento índigo, badges con texto, `tabular-nums`):
  - Header: nombre · campaña/conjunto · **badge de estado** (emerald ACTIVE / zinc PAUSED) · botón **pausar/activar**.
  - Izquierda: `<iframe sandbox>` con el preview real. La galería usa **un placement fijo** (Feed, `MOBILE_FEED_STANDARD`) para no multiplicar llamadas — el toggle de *todos* los placements aplica solo al Estudio.
  - Derecha: grilla de KPIs (gasto, CPC, CPM, CTR, clics, impresiones, alcance, frecuencia, CPA, conversiones).
- **Pausar/activar:** botón → server action `cambiarEstadoAd(adId, next)`. Activar muestra confirmación + aviso *"esto puede empezar a gastar"*.

### 2. Estudio — panel "Anuncio Meta" (`ad-studio.tsx`, paso 3 o 4)

Por cada propuesta seleccionada, después de generar media:

- **Previsualizar como anuncio Meta:** sube media (`uploadAdImage`/`uploadAdVideo`) → `buildCreativeSpec` → `previewProposal(spec, TODOS_LOS_FORMATOS)` → iframes con **toggle de placement**.
- **Crear anuncio (pausado):**
  - Selector cuenta (fija) → **campaña** (`listCampaigns`, con opción "➕ crear nueva") → **conjunto** (`listAdsets`, con opción "➕ crear nuevo": presupuesto diario USD, días, país).
  - CTA (`call_to_action.type`, ej `LEARN_MORE`) + link de destino.
  - `crearAnuncioDesdePropuesta(...)` → `createAdFromProposal` (y `createCampaign`/`createAdset` si se eligió crear). Éxito → mensaje + link a la galería en Difusión.
- Reusa el copy de la propuesta (`platforms.facebook.post` / `headline`) y la `imageUrl`/`videoUrl` ya generadas en el estudio.

## Flujo de datos

- **Lectura (galería):** server component → `listMyAds` → render. `getAdPreview` para el iframe (server-side; el HTML de Meta se embebe en `<iframe sandbox>`).
- **Mutaciones:** server actions en `publicaciones/actions.ts`:
  - `cambiarEstadoAd(adId, status)` → `setAdStatus` + `logAudit` + `revalidatePath('/difusion')`.
  - `listarCampaigns()`, `listarAdsets(campaignId)` → selectores del estudio.
  - `previsualizarPropuestaAd(proposal, media, formats)` → `{ previews: {format, html}[] }`.
  - `crearAnuncioDesdePropuesta({ proposal, media, adsetId | nuevoAdset, cta, link })` → crea ad PAUSED + `logAudit(entity_type:'ad')`.
- Token nunca sale al cliente; los iframes ya vienen renderizados desde Meta.

## Errores y seguridad

- **Token server-only.** Iframe de Meta embebido con `<iframe sandbox>` (sin `allow-same-origin` salvo lo mínimo que requiera el render de Meta).
- **Todo se crea PAUSED** (no gasta). La única operación que puede gastar es `setAdStatus → ACTIVE`: gated tras botón + confirmación explícita con aviso.
- **Paridad mock:** sin credenciales todo corre en mock (ids/metrics determinísticos). En mock, el área de preview muestra *"Conectá Meta (Conectores → Meta) para ver el preview real"* en vez de una card falsa (se eligió preview real).
- Errores de Graph se propagan como `MetaResult.error` / `{ ok:false, error }`, mostrados como ya hace Difusión.
- Subida de video: poll con timeout; si no llega a `ready`, error claro.
- Permisos: `requireMember("editor")` en las actions (como el resto del Estudio).

## Testing (vitest, estilo `tests/ad-proposals.test.ts`)

- `buildCreativeSpec`: forma correcta para imagen (`link_data`) y video (`video_data`), con CTA y link.
- Cálculo de **CPA/CPC/CPM** y parseo de `actions[]` → **conversiones** desde una fila de insights de ejemplo.
- `listMyAds` en **modo mock**: determinístico y con todos los KPIs esperados.
- `createAdFromProposal`/`previewProposal` en **modo mock** (sin token) devuelven mock sin pegarle a la red.
- Mapeo de `AdFormat` → `ad_format` (catálogo completo, sin valores inválidos).

## Plan de implementación (alto nivel, se detalla en writing-plans)

1. `lib/meta-ads.ts` con mock-first + extensión de `getInsights`. Tests de cálculo/spec/mock.
2. Galería "Mis anuncios" en Difusión (`MisAnuncios` + AdCard + filtros + toggle estado).
3. Panel "Anuncio Meta" en el Estudio (preview todos los placements).
4. Crear-ad PAUSED desde propuesta (selectores + crear campaña/conjunto al vuelo).
5. Audit log + estados mock/sin-credenciales + verificación.
