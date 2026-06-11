# Rediseño de Escucha — diseño + plan

**Fecha:** 2026-06-11 · **Branch:** `feat/escucha-redesign` (off main) · **Estado:** aprobado en brainstorming.

## Problema

`/escucha` es hoy una sola página larga que mezcla el form de configuración con toda la visualización (stats, tag clouds, rankings, feed, temas). El usuario quiere: (1) **separar** configurar de visualizar, (2) una vista de **monitoreo inmersiva y atractiva**, (3) **marcar contenido** para armar un **informe custom** con lo marcado.

## Decisiones (brainstorming)

1. **Tabs** dentro de `/escucha`: **Monitorear** (default, inmersiva) | **Configurar**.
2. Monitor prioriza **los 4**: volumen en el tiempo, feed vivo tipo wall, temas emergentes destacados, sentiment + tags + autores.
3. Informe = **PDF** (reusa `@react-pdf/renderer`, patrón de `lib/pdf/campaign-pdf.tsx`).
4. Marcas en **Supabase** (tabla nueva `escucha_marcas`), con fallback no-op claro sin DB.

## Dependencia cross-feature

El pop-out del monitor usa `?solo=1`, cuyo ocultamiento de chrome vive en `feat/nav-redesign` (`components/dashboard/chrome.tsx`). El botón se incluye igual; el chrome se oculta del todo recién cuando nav se mergee. Sin nav, `?solo=1` abre la ventana pero con sidebar.

## Arquitectura

- `/escucha` sigue siendo **server component**; lee `searchParams.tab` (`monitor`|`config`, default `monitor`). Tab nav = links `?tab=…`. Con `?solo=1` el monitor va full (lo resuelve el Chrome de nav).
- **Configurar**: el form actual se extrae a `components/escucha/config-form.tsx` (mismo markup/acción `guardarEscucha`), incluido el bloque Estado/fuentes. Sin cambios funcionales.
- **Monitorear**: nuevo `components/escucha/monitor.tsx` que recibe el `ListeningResult` + las marcas y arma la vista inmersiva.
- **Marcas**: tabla Supabase + `lib/escucha-marcas.ts` (CRUD) + server actions toggle/list. Cada ítem (feed/tema) tiene `itemKey` estable. Componente client `MarkButton` (toggle optimista) y `ReportTray` (contador + “Generar informe”).
- **Informe PDF**: `lib/pdf/escucha-pdf.tsx` (Document) + route handler `app/(dashboard)/escucha/informe/route.ts` (GET → `renderToBuffer` → `application/pdf`) que toma las marcas del proyecto.

### Archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `supabase/migrations/0041_escucha_marcas.sql` | Crear | Tabla `escucha_marcas`. |
| `lib/escucha-marcas.ts` | Crear | Tipos + CRUD (`listMarcas`, `toggleMarca`) sobre Supabase; sin DB → `[]` / no-op. `itemKey(item)`. |
| `app/(dashboard)/escucha/actions.ts` | Modificar | + `marcarToggle(input)`, `listarMarcas()`. |
| `app/(dashboard)/escucha/page.tsx` | Reescribir | Tabs (server, `searchParams.tab`) → `<ConfigForm>` / `<Monitor>`. |
| `components/escucha/config-form.tsx` | Crear | Form de config extraído del page actual (incluye bloque Estado + fuentes). |
| `components/escucha/monitor.tsx` | Crear | Vista inmersiva (4 bloques) + marcado + ReportTray. |
| `components/escucha/mark-button.tsx` | Crear | Client: toggle de marca (estado optimista). |
| `components/escucha/report-tray.tsx` | Crear | Client: contador de marcas + botón "Generar informe (PDF)" + pop-out. |
| `components/escucha/volume-chart.tsx` | Crear | Sparkline de volumen por día derivado de `feed[].publishedAt` (server component, SVG inline). |
| `lib/pdf/escucha-pdf.tsx` | Crear | `EscuchaInformeDocument({ marcas, meta })`. |
| `app/(dashboard)/escucha/informe/route.ts` | Crear | GET → PDF de las marcas del proyecto. |
| `tests/escucha-marcas.test.ts` | Crear | `itemKey` estable/determinístico; bucketing de volumen. |

## Contratos

### Migración `0041_escucha_marcas.sql`
```sql
create table if not exists escucha_marcas (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  item_key text not null,
  kind text not null,                 -- 'feed' | 'topic'
  payload jsonb not null,             -- snapshot: text, source, author, url, sentiment, etc.
  created_at timestamptz not null default now(),
  unique (project_id, item_key)
);
create index if not exists escucha_marcas_project_idx on escucha_marcas (project_id, created_at desc);
```

### `lib/escucha-marcas.ts`
```ts
export interface Marca {
  itemKey: string;
  kind: "feed" | "topic";
  payload: Record<string, unknown>;
  createdAt?: string;
}
// itemKey estable: hash de url || text (sin Date.now). Determinístico.
export function itemKey(seed: string): string;
export async function listMarcas(projectId: string): Promise<Marca[]>;     // sin DB → []
// toggle: si existe (project_id,item_key) borra y devuelve {marked:false}; si no, inserta {marked:true}.
export async function toggleMarca(projectId: string, m: Marca): Promise<{ ok: boolean; marked: boolean; msg: string }>; // sin DB → {ok:false, marked:false, msg:"Supabase no configurado"}
```

### Server actions (`escucha/actions.ts`)
```ts
export async function marcarToggle(input: { itemKey: string; kind: "feed" | "topic"; payload: Record<string, unknown> }): Promise<{ ok: boolean; marked: boolean; msg: string }>;  // requireMember("editor")
export async function listarMarcas(): Promise<{ itemKey: string }[]>; // solo keys, para hidratar estado del cliente
```

### Volumen (`volume-chart.tsx` + helper testeable en `lib/escucha-marcas.ts` o `lib/listening`)
```ts
// Agrupa feed por día (YYYY-MM-DD) según publishedAt; devuelve serie ordenada.
export function volumeBuckets(items: { publishedAt?: string }[], nowMs: number): { day: string; count: number }[];
```
(El `nowMs` se pasa desde el server; no usar Date.now en el helper para mantenerlo puro/testeable.)

## Monitor — layout inmersivo (DESIGN.md: zinc + acento índigo)

Orden vertical, full-width, glanceable:
1. **Barra de pulso**: 4 Stats grandes (totales, pos, neg, neutras) + `<VolumeChart>` (sparkline) al lado. Header con "actualiza cada 60s" + `<ReportTray>` a la derecha.
2. **Temas emergentes** destacados (bloque amber grande, con breakdown por fuente + `<MarkButton kind="topic">` por tema + CTA "Diseñar encuesta").
3. **Feed wall**: grilla/columna de menciones (reusa estética de `Feed`) con badge de fuente + sentiment, cada una con `<MarkButton kind="feed">`. Autorefresca con el `revalidate=60` existente.
4. **Sentiment + tags + autores**: tag clouds pos/neg + rankings (reusa `TagCloud`, `AuthorRankingList`).

`ReportTray`: muestra "N marcados", botón **Generar informe (PDF)** (link a `/escucha/informe` que descarga el PDF) y botón **Abrir en ventana** (`window.open("/escucha?tab=monitor&solo=1", …)`).

## Errores / edge

- Sin Supabase: marcado deshabilitado con tooltip "Configurá Supabase para marcar y generar informes"; el resto del monitor anda igual (corre con defaults como hoy).
- Marcado optimista en cliente; si la action falla, revierte + muestra msg.
- PDF: si no hay marcas → PDF con mensaje "Sin contenido marcado" (no romper).
- `itemKey` y `volumeBuckets` puros y testeados.
- Accesibilidad: MarkButton con `aria-pressed`.

## Testing

- `tests/escucha-marcas.test.ts`: `itemKey` determinístico (misma entrada → misma salida; url vs text); `volumeBuckets` agrupa por día y ordena, ignora `publishedAt` inválido.
- Resto: tsc + lint + verificación manual.

## Acceptance

- `/escucha` abre en Monitor; tab Configurar muestra el form actual intacto y guarda igual.
- Monitor: 4 bloques presentes, atractivos, full-width; corre con/sin credenciales.
- Marcar feed/tema persiste en Supabase y se refleja al recargar; ReportTray cuenta las marcas.
- "Generar informe" descarga un PDF con lo marcado.
- `npx vitest run`, `npx tsc --noEmit`, `npm run lint` verdes.
