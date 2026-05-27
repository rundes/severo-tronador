# Diseño — Supabase como capa de persistencia operativa

- **Fecha**: 2026-05-27
- **Estado**: aprobado (brainstorming)
- **Alcance de este spec**: la fundación de persistencia (feature #3). Las
  features #1 (config de conectores por UI) y #2 (config de escucha) se
  apoyan en esta base y tienen su propio spec/plan posterior — acá solo se
  definen sus puntos de enganche.

## 1. Contexto y problema

Hoy todo el estado operativo vive en stores en memoria (`globalThis`):
campañas, plantillas, cuotas, respuestas, opt-outs, tokens de encuesta,
llamadas. En Vercel (serverless) esto **no persiste de forma confiable entre
requests** y se pierde en cada cold start. Es el bloqueante P0 de
[STABILIZATION.md](../../STABILIZATION.md).

Además, el padrón hoy se lee de un Google Sheet fijado por env (o el mock de
100 filas). Requisito nuevo: **el usuario carga su propio padrón después de
loguearse; nada predefinido**.

## 2. Objetivos / No-objetivos

**Objetivos**
- Supabase (Postgres) como **base de datos operativa** de la app.
- Google Sheets como **capa de preservación + consulta externa**, espejada
  desde Supabase.
- El padrón se **ingesta por el usuario** (CSV o conectar un Sheet) → Supabase.
- Reemplazar los stores `globalThis` sin cambiar el comportamiento visible.

**No-objetivos**
- Multi-tenant / RLS (decisión: **single-tenant**, un deploy = una cuenta).
- Cambiar el login (se mantiene **NextAuth + Google OAuth + allowlist**).
- Implementar #1 y #2 acá (solo dejar los puntos de enganche).

## 3. Decisiones (cerradas en brainstorming)

| Tema | Decisión |
|---|---|
| Tenencia | **Single-tenant**. Server escribe con `SUPABASE_SERVICE_ROLE_KEY`, sin RLS. "Mi cuenta" = la cuenta del deploy. |
| Auth | NextAuth se queda; Supabase es solo persistencia (no Supabase Auth). |
| Padrón | Cargado por el usuario post-login (CSV o conectar Sheet) → tabla `padron`. Sin padrón predefinido; mock solo si no hay datos (dev). |
| Sheets sync | **Espejo en cada escritura, write-behind**: cada escritura preservable encola una fila; un Vercel Cron drena a Sheets con batching + backoff. |
| Estructura | **Enfoque A**: interfaz `Repository` por entidad + decorador `withMirror`. |

## 4. Arquitectura

```
NextAuth (login)                 Vercel Cron (cada 1 min)
     │                                    │
     ▼                                    ▼
  App (server actions / route handlers)   /api/cron/sheets-sync
     │  lee/escribe                         │ drena sheets_sync_queue
     ▼                                      ▼  (batch + backoff 429)
  Repository<T> (Supabase)  ──encola──►  sheets_sync_queue  ──►  Google Sheets
     │                                                            (preservación)
     └─ withMirror() inserta en la cola en la misma operación
```

- **Escritura**: el repo escribe a Supabase (sincrónico, fuente de verdad) y,
  si la entidad es preservable, inserta una fila en `sheets_sync_queue`.
- **Espejo**: el cron lee las filas `pending`, las agrupa por hoja y las
  escribe a Sheets respetando 60 writes/min; ante 429 hace backoff y reintenta;
  marca `done`/`error`.
- **Lectura**: siempre desde Supabase. Sheets nunca está en el hot path.

## 5. Modelo de datos

**Tablas espejadas a Sheets** (preservación / consulta externa):

| Tabla | Campos clave |
|---|---|
| `padron` | dni (uniq), nombre, apellido, fecha_nac, sexo, domicilio, barrio, circuito, mesa, telefono, email, source, imported_at |
| `segmentos` | id, nombre, filtros (jsonb), created_at, created_by |
| `templates` | id, channel, nombre, asunto, cuerpo, estado, created_at |
| `campanas` | id, nombre, channel, template_id, segment_filter (jsonb), preguntas (jsonb), estado, metrics (jsonb), created_at |
| `envios` | id, campaign_id, dni, nombre, destino, estado, reason, provider_message_id, delivery, token, created_at |
| `respuestas` | id, token, campaign_id, dni, answers (jsonb), created_at |
| `opt_outs` | dni (uniq), at, reason |
| `llamadas` | id, dni, at, outcome, notes |

**Tablas solo Supabase** (operativo/secreto, NO van a Sheets):

| Tabla | Rol |
|---|---|
| `conector_config` | connector_id (uniq), config (jsonb, **encriptado**), enabled, updated_at |
| `cuotas` | connector_id (uniq), used, period, resets_at, updated_at |
| `listening_config` | id, geo (jsonb), keywords (text[]), fuentes (text[]), radio, updated_at |
| `survey_tokens` | token (uniq), campaign_id, dni, created_at |
| `listening_items` | id, source, text, url, published_at, topic |
| `sheets_sync_queue` | id, entity, op, payload (jsonb), status, attempts, last_error, created_at |

**Regla de espejo del padrón** (resuelve la ambigüedad planteada): si el
padrón se ingestó **desde CSV**, se espeja a la hoja de preservación; si su
origen fue **un Google Sheet conectado**, NO se re-espeja (ese Sheet ya es la
copia externa) — `padron.source` distingue el caso.

## 6. Ingest del padrón

Pantalla protegida **`/padron`** con "Importar padrón":
1. **CSV**: subir archivo → parse (headers = columnas) → `upsert` por `dni`.
2. **Conectar Sheet**: Sheet ID + service account (usa el conector
   `google-sheets` ya existente) → lee `padron!A1:Z` → `upsert` por `dni`.

Muestra conteo de filas y fecha de import; permite re-importar (reemplaza por
`dni`). `lib/segments.ts → loadContacts()` pasa a leer de la tabla `padron`
(Supabase) en vez del conector Sheets directo. Sin padrón cargado, cae al mock
solo en dev.

## 7. Abstracción de repos

```ts
// lib/db/types.ts
export interface Repository<T extends { id?: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  upsert(row: T): Promise<T>;
  remove(id: string): Promise<void>;
}
```

- Impl Supabase genérica `supabaseRepo<T>(table)` usando el cliente
  service-role (`lib/db/supabase.ts`).
- `withMirror(repo, { sheet, mapRow })` → decorador que, tras `upsert`/`remove`,
  inserta en `sheets_sync_queue`.
- Entidades con queries propias (ej. `padron.filter(SegmentFilter)`) extienden
  la interfaz base.
- Los módulos actuales (`campaigns.ts`, `survey.ts`, `optout.ts`, `quota.ts`,
  `templates.ts`, `calls.ts`, `segments.ts`) cambian su store `globalThis` por
  el repo correspondiente. La firma pública de cada módulo se mantiene para no
  tocar la UI.

## 8. Encriptación de credenciales

`conector_config.config` se guarda encriptado (AES-GCM con `CONFIG_MASTER_KEY`
en env). Helpers `encrypt`/`decrypt` en `lib/crypto.ts`. Nunca se espeja a
Sheets ni se loguea.

## 9. Variables de entorno nuevas

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CONFIG_MASTER_KEY=            # 32 bytes base64 para AES-GCM
SHEETS_PRESERVATION_SHEET_ID= # Sheet destino del espejo
CRON_SECRET=                  # protege /api/cron/sheets-sync
```

Sin `SUPABASE_URL`/`SERVICE_ROLE_KEY`, la app cae a los stores en memoria
actuales (modo dev/mock) — degradación, no error.

## 10. Puntos de enganche de #1 y #2 (specs aparte)

- **#1 config de conectores**: lee/escribe `conector_config`. Los conectores
  resuelven su config con prioridad `conector_config` → env → vacío(mock). El
  modal del panel usa el `configSchema` existente.
- **#2 config de escucha**: lee/escribe `listening_config`. `runListening()`
  arma el `ListenQuery` (geo + keywords + fuentes) desde esa tabla.

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Sheets 429 / lentitud | Cola write-behind + batching + backoff; Sheets fuera del hot path. |
| Cron falla → cola crece | `attempts` + `last_error`; alerta si `pending` > umbral; reintento idempotente. |
| Doble escritura a Sheets | `sheets_sync_queue` con op idempotente por (entity,id); el cron hace upsert por clave en la hoja. |
| Re-import de padrón duplica | `upsert` por `dni` (unique). |
| Cold start sin Supabase | Fallback a memoria (degradación controlada). |
| Migración rompe módulos | Mantener firmas públicas; tests por módulo. |

## 12. Testing

- Unit: `Repository` Supabase mockeado (sin red), `withMirror` (encola bien),
  parser de CSV/padrón, `crypto`.
- Integración: cola → cron → Sheets (Sheets API mockeada con MSW), dedupe de
  import por dni.
- Regresión: los flujos actuales (segmentos, campañas, encuestas, opt-out,
  cierre) siguen pasando con repos en vez de memoria.

## 13. Fuera de alcance (este spec)

UI completa de #1/#2, multi-tenant/RLS, Supabase Auth, dashboards nuevos,
listening real (fetch de GDELT/X/Reddit), Vercel Cron de la cola de **envíos**
(distinta de la cola de sync a Sheets).
