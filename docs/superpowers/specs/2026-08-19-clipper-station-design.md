# Estación de clipping (Chromebook + Claude for Chrome) — diseño

**Fecha:** 2026-08-19 · **Estado:** propuesta

## Qué es

Un componente nuevo: una **estación de clipping** — una Chromebook vieja, prendida
todo el día, con una sesión de Chrome logueada con **cuentas institucionales
reales** del centro de estudios, que recorre los perfiles, grupos y páginas que
cada cliente marque como importantes en el panel y **clipea** lo nuevo
(posts, comentarios, hilos) hacia `listening_items`, alimentando los tableros de
/escucha existentes (sentiment, temas, autores, emergentes).

Automatiza lo que hoy hace un operador a mano para analizar la conversación de
una región/municipio, un tema o una marca. **No** reemplaza el criterio: la
selección de fuentes, la membresía a grupos y cualquier participación quedan en
manos humanas.

## Por qué Claude for Chrome y no más Playwright

El fb-worker (Playwright + selectores) se rompe con cada cambio de layout — esta
misma semana hubo que reescribirlo tres veces. El plugin de Claude para Chrome
navega **semánticamente**: "abrí esta página, extraé los posts nuevos con autor,
fecha y texto" no depende de `role=article` ni de patrones de permalink. Costo:
tokens de API por visita. Beneficio: robustez ante layouts y capacidad de
extraer lo que un selector no puede (fechas relativas, hilos, contexto).

Los dos conviven: fb-worker sigue como barrido barato 2×/día; la estación cubre
las fuentes de alta prioridad con más frecuencia y mejor calidad de dato.

## Principios (no negociables)

1. **Identidad real.** Cuentas institucionales con nombre del centro/cliente,
   nunca cuentas falsas ni "quemables". Si un grupo requiere aprobación, la
   cuenta la **solicita** y espera; si la echan, se acata.
2. **Solo lo visible para la cuenta.** Grupos privados únicamente con membresía
   aprobada. Perfiles privados: no. Sin evasión de bloqueos: si la plataforma
   corta la sesión, la estación reporta y se detiene — no rota cuentas ni IPs.
3. **Participación con humano en el loop.** La estación puede DETECTAR
   oportunidades de conversación y **redactar borradores**, pero nunca publica:
   los borradores van a una cola de revisión en el panel y un operador aprueba,
   edita o descarta.
4. **Cadencia respetuosa.** Visitas espaciadas con tope diario por fuente y por
   estación. "Todo el día" significa estación disponible, no scraping continuo.
5. **Mismas reglas de datos** que el resto del sistema: retención (0056),
   RLS deny-all, aislamiento por proyecto.

## Arquitectura

```
Panel (/escucha → Clipping)          Vercel (app)                Chromebook (estación)
┌──────────────────────────┐   ┌─────────────────────────┐   ┌───────────────────────────┐
│ CRUD fuentes por proyecto │   │ /api/clipper/next        │◄──│ loop: pedir tarea          │
│ prioridad / frecuencia    │──►│ /api/clipper/report      │◄──│ Claude Code CLI            │
│ cola de borradores        │   │ (auth: CLIPPER_TOKEN)    │   │  + claude-in-chrome        │
│ estado de la estación     │   │ upsert listening_items   │   │  + Chrome con sesión       │
└──────────────────────────┘   │ connector_id="clipper"   │   │    institucional           │
                               └─────────────────────────┘   │ heartbeat + screenshots    │
                                                              └───────────────────────────┘
```

### Modelo de datos (migración nueva)

- **`clipper_sources`** — `id`, `project_id`, `platform` (facebook/instagram/x/otro),
  `kind` (pagina/grupo/perfil), `url`, `label`, `prioridad` (alta/media/baja),
  `frecuencia_horas` (default por prioridad: 4/8/24), `estado`
  (`pending_join` / `active` / `paused` / `blocked`), `notas`, `last_visited_at`,
  `high_water_mark` (último permalink/fecha visto), timestamps.
- **`clipper_drafts`** — cola de participación: `id`, `project_id`, `source_id`,
  `context_url`, `context_text`, `draft_text`, `estado`
  (`pending` / `approved` / `discarded` / `posted`), `reviewed_by`, timestamps.
  (`posted` lo marca el operador tras publicar A MANO desde la cuenta.)
- **`clipper_stations`** — `id`, `label`, `token_hash`, `last_seen_at`,
  `current_source_id`, `status`. Heartbeat también a `cron_heartbeats`
  (`clipper:<station>`) para reusar la alerta de crons existente.

RLS deny-all como todo lo demás; acceso por service-role en `lib/db/`.

### API (App Router, auth por token de estación, patrón CRON_SECRET)

- **`GET /api/clipper/next`** → la fuente más vencida (`now - last_visited_at >
  frecuencia`) de proyectos activos, con su `high_water_mark` y las keywords del
  proyecto. Claim con lease (como `send-queue` 0050) para permitir 2+ estaciones.
- **`POST /api/clipper/report`** → items normalizados
  `{url, text, author, published_at?, kind, parent_url?}` + nuevo
  `high_water_mark` + resultado (`ok` / `blocked` / `login_required` / `empty`).
  Upsert on conflict `(project_id, url)` con `connector_id="clipper"`.
  `blocked`/`login_required` pausan la fuente y alertan.
- **`POST /api/clipper/draft`** → propone borrador a `clipper_drafts`.

### Integración con /escucha (mínima)

- `cacheConnectorFilter`: sumar `"clipper"` a las ingestas externas (junto a
  `radio` y `fb-pages`).
- `platformOf`: mapear `clipper` → por prefijo de `source`
  (`facebook/...`→meta, `x/...`→x, resto→otros).
- Tab **Clipping** en /escucha Config: tabla de fuentes (alta/edición/pausa),
  estado de estación (último heartbeat, fuente en curso), cola de borradores
  con aprobar/editar/descartar.

### La estación (Chromebook)

- **SO:** ChromeOS con Crostini (Linux) o ChromeOS Flex. Dentro del contenedor
  Linux: Chromium + extensión Claude for Chrome + Claude Code CLI. (La
  extensión debe correr en el MISMO entorno que el CLI; el Chrome de ChromeOS
  no es controlable desde Crostini.)
- **Loop** (script + systemd timer, cada ~15 min):
  1. `GET /next`; si no hay fuente vencida → dormir.
  2. Sesión de Claude Code con prompt operativo fijo: abrir la URL con
     claude-in-chrome, verificar sesión (si pide login → reportar
     `login_required` y cortar), extraer lo NUEVO desde el `high_water_mark`
     (autor, texto, fecha real, permalink, comentarios relevantes), sin
     interactuar con nada (no like, no join, no reply).
  3. `POST /report`.
  4. Si el proyecto tiene "detección de conversación" activa: además proponer
     hasta N borradores por día vía `/draft` (solo texto, nunca publicar).
  5. Screenshot a un bucket en cada fallo; heartbeat siempre.
- **Presupuesto de tokens:** cada visita es una sesión corta (~1 fuente, extract
  only). Con 20 fuentes de alta prioridad × 4 visitas/día ≈ 80 sesiones/día.
  Tope diario configurable por estación en el panel; al alcanzarlo, la estación
  degrada a solo-prioridad-alta.

## Fases de entrega

| Fase | Qué entrega | Esfuerzo |
|---|---|---|
| C1 | Migración (`clipper_sources`/`clipper_drafts`/`clipper_stations`) + endpoints next/report + `connector_id` visible en /escucha | ~3 días |
| C2 | Tab Clipping en el panel: CRUD de fuentes + estado de estación | ~3 días |
| C3 | Estación mínima: loop en la Chromebook, FB páginas + grupos con membresía, extract-only | ~1 semana |
| C4 | High-water marks finos, fechas reales, comentarios/hilos, dedupe contra fb-worker | ~3 días |
| C5 | Cola de borradores (detección + redacción + revisión en panel) | ~1 semana |
| C6 | Operación: watchdog, screenshots de fallo, tope de tokens, 2ª estación | continuo |

C1–C2 son código de la app (patrones ya existentes: send-queue claim, CRON_SECRET,
conector_config). C3 es el riesgo real — prototipo primero con UNA fuente antes
de generalizar.

## Riesgos y mitigaciones

- **ToS de las plataformas.** La automatización del navegador con cuenta
  logueada puede violar términos incluso con identidad real y solo lectura de
  lo visible. Mitigación: cuentas institucionales del cliente (el cliente asume
  la decisión, informado), cadencia baja, sin evasión, parada automática ante
  cualquier señal de bloqueo. Decisión por cliente en el panel (opt-in
  explícito por proyecto).
- **Chromebook vieja = poca RAM.** Chromium + extensión + CLI puede no entrar
  en 4GB. Mitigación: probar; plan B = mini-PC barato con Linux liviano; el
  diseño no depende del hardware.
- **Costo de tokens.** Medir en C3 con una fuente real antes de escalar; el
  tope diario por estación está en el diseño desde el día uno.
- **Duplicados con fb-worker.** Mismo upsert `(project_id, url)` — el
  permalink canónico es la clave; C4 unifica la canonicalización.
