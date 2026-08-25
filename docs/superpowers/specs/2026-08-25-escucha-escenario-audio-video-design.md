# Escucha: pestaña Escenario por canal + audio y video (radio, YouTube, Kick)

**Fecha:** 2026-08-25 · **Estado:** aprobado (diseño) · **Depende de:** `2026-08-25-brief-cliente-escenario-ia-design.md` (implementado, `a70f253`).

## Problema

Con el brief del cliente y la propuesta de IA, `/escucha` quedó incoherente: el brief y
los actores sugeridos viven en Informe, el escenario de cuentas/búsquedas también, y
"Configurar" mezcla territorio, feeds, radios y toggles sin relación con el brief. La
radio (grabación programada + transcripción, `2026-06-11-escucha-radio-design.md`) es
una fuente de primera pero está escondida al pie de Configurar. No hay seguimiento de
streaming de video (YouTube, Kick), que para el cliente es el mismo concepto que la
radio: una franja al aire que se graba, transcribe y matchea.

## Decisiones

- **3 tabs: Escenario · Monitorear · Informe.** Escenario reemplaza Configurar y es la
  única fuente de verdad de "qué escuchamos"; `?tab=config` redirige.
- **Escenario agrupado por canal**, cada canal un bloque con su propio Guardar:
  Contexto del cliente · Territorio · Prensa · Redes · Audio y video · Reglas del informe.
- **Radio y streaming son el mismo modelo**: `AudioProgram` con `kind: radio | youtube |
  kick`, misma franja, mismo worker (grabar → transcribir → matchear). Sin DDL: misma
  columna `listening_config.radio_streams`.
- **La IA propone también programas de audio/video** que el brief o lo vigente nombren,
  siempre con `nota` de verificación; nunca inventa franjas.
- **Propuesta aplicada por bloque** (territorio, redes, audio, reglas), no por "todo o
  nada".
- Fuera de alcance: grabar "siempre que esté en vivo" (sin franja), chat/comentarios/VODs,
  rediseño del stream de menciones, cambios en la extensión de Chrome.

## Datos

### `lib/audio-programs.ts` (nuevo; `lib/radio.ts` re-exporta para compatibilidad)

```ts
export type AudioKind = "radio" | "youtube" | "kick";

export interface AudioProgram {
  kind: AudioKind;      // filas viejas sin kind → "radio" al leer
  url: string;          // radio: stream Icecast/Shoutcast · youtube: URL del canal o /live · kick: URL del canal
  station: string;      // nombre de la radio / canal (→ listening_items.source y author)
  programa: string;
  days: number[];       // 0-6 (Dom..Sáb)
  start: string;        // "HH:MM" local; "" = franja incompleta (no se graba)
  end: string;
  nota?: string;        // "verificar url" / "completar franja" cuando lo propone la IA
}

export function normalizeAudioProgram(raw: Partial<AudioProgram>): AudioProgram; // kind default, trims
export function hasValidSlot(p: AudioProgram): boolean;   // days no vacío y start/end "HH:MM" válidos, start < end
export function isValidUrlFor(kind: AudioKind, url: string): boolean; // http(s) público; youtube/kick host match
export function programsActiveAt(programs: AudioProgram[], nowMs: number): AudioProgram[]; // solo con hasValidSlot
```

`RadioProgram` queda como `type RadioProgram = AudioProgram` en `lib/radio.ts`;
`programsActiveAt`/`matchKeywords`/`transcriptToItems` se mantienen (los dos últimos sin
cambios). `listening-config.ts` mapea `radio_streams` con `normalizeAudioProgram`.

### `ScenarioProposal` (`lib/client-brief.ts`)

```ts
interface ScenarioProposal {
  …campos actuales…
  audio: AudioProgram[];                     // nuevo
  applied: {                                  // reemplaza appliedKeywordsAt / appliedMonitorAt
    territorio?: string; redes?: string; audio?: string; reglas?: string;
  };
}
```

Lectura tolerante: una propuesta vieja con `appliedKeywordsAt`/`appliedMonitorAt` se
mapea a `applied.territorio` / `applied.redes` + `applied.reglas` (ambas venían juntas
en "Guardar escenario"). `audio` ausente → `[]`.

## Tab Escenario (de arriba a abajo)

Cada bloque es un `<details>` con `summary` = título + resumen de estado + badge ámbar
"propuesta pendiente" cuando la propuesta tiene contenido para ese bloque y `applied.<bloque>`
está vacío. Cada bloque tiene su form y su Guardar; Guardar marca `applied.<bloque>`.

| # | Bloque | Contenido | Origen hoy | Componente |
|---|---|---|---|---|
| 1 | Contexto del cliente | brief + generar + banner de propuesta ("aplicada N/4") + actores sugeridos | Informe | `brief-panel.tsx`, `actor-suggestions.tsx` (sin cambios de fondo) |
| 2 | Territorio | zona, país, mapa/radio km, keywords | Configurar | `bloque-territorio.tsx` (extraído de `config-form.tsx`) |
| 3 | Prensa | medios RSS, toggles Google News / GDELT, conteos por fuente | Configurar | `bloque-prensa.tsx` |
| 4 | Redes | FB páginas/grupos, Telegram, X handles, toggle X; cuentas del plan y búsquedas A/B | Configurar + Informe | `bloque-redes.tsx` (feeds sociales + parte de `monitor-editor.tsx`) |
| 5 | Audio y video | programas `AudioProgram` (editor por líneas) + toggle Radio + agenda (próximas grabaciones / últimas corridas, con `no_live`) | Configurar | `bloque-audio.tsx` (nuevo) + `radio-agenda.tsx` |
| 6 | Reglas del informe | entidades, calendario, memoria de errores | Informe | `bloque-reglas.tsx` (parte de `monitor-editor.tsx`) |

Formato del editor de audio (una línea por programa):
`kind, fuente, url, programa, días, inicio-fin[, nota]` · ej.
`radio, LU30, https://stream…, La mañana, L-V, 08:00-10:00` ·
`youtube, Canal Ibicuy, https://www.youtube.com/@canalibicuy/live, Noticiero, L-V, 20:00-21:00`.
Días admiten `L-V`, `L,M,J`, `S-D`, `todos`. Líneas con franja vacía se guardan (para completar después) pero no graban.

`config-form.tsx` y `monitor-editor.tsx` se eliminan al terminar (su contenido se reparte).
`escenario-tab.tsx` compone los seis bloques.

## Tab Monitorear

Sin cambios de fondo. Nuevo carril **"Al aire"** arriba del stream de menciones
(`components/escucha/al-aire.tsx`, server component): `Grabando: <fuente> · <programa> · hasta HH:MM` ·
`Próximo: … en N min` · `Último transcripto: … hace N h (M menciones)`. Datos de
`agendaUpcoming` + `listRecentRuns`. Sin programas → no se renderiza. Link "Configurar →"
al bloque Audio y video.

## Tab Informe

Conserva: informe vigente, historial, extensión de Chrome. Pierde brief, actores
sugeridos y escenario (van a Escenario).

## Rutas / carga

- `page.tsx`: `tab ∈ {escenario, monitor, informe}`; `config` → `redirect("/escucha?tab=escenario")`.
  Carga por tab: escenario → config, brief, pull summary, counts, agenda, monitor-config;
  monitor → `runListening` + agenda/corridas (para "Al aire"); informe → reports.
- Acciones (`actions.ts`): `guardarTerritorio`, `guardarPrensa`, `guardarRedes`,
  `guardarAudio`, `guardarReglas` reemplazan a `guardarEscucha` + `guardarMonitor`.
  Cada una valida su parte, persiste (`saveListeningConfig` parcial / `saveMonitorConfig`
  parcial) y marca `applied.<bloque>`. `guardarEscucha` se mantiene un release como alias
  de territorio+prensa+redes(feeds)+audio para no romper formularios cacheados; luego se borra.
- Redirects de estado: `/escucha?tab=escenario&ok=<bloque>` y `&error=<bloque>:<motivo>`.

## IA

- `ScenarioSchema` suma `audio: z.array(AudioProgramSchema)`; un programa inválido
  (kind desconocido, url no http(s)) se descarta individualmente, no invalida la propuesta;
  franja vacía se acepta con `nota: "completar franja"`.
- Prompt: sección "Audio y video vigente" (JSON) + regla: "audio: solo radios o canales de
  YouTube/Kick que el brief o el vigente nombren; kind según la plataforma; si no
  conocés la franja, dejá start/end vacíos y nota 'completar franja'; nunca inventes URLs
  de stream — si no la sabés, poné la URL del canal y nota 'verificar url'".
- `FERRO_EXAMPLE_JSON` suma un programa de ejemplo (radio partidaria del club).
- Banner de propuesta: "Propuesta del … · aplicada N/4 (faltan: Territorio, Audio)".

## Worker (`tools/radio-pull.mjs`, `.github/workflows/radio-pull.yml`)

- `GET /api/cron/radio-config` devuelve `AudioProgram[]` con `kind` (solo `hasValidSlot`).
- `resolveStreamUrl(program)`: `radio` → `url`; `youtube`/`kick` → `yt-dlp -g --no-playlist <url>`.
  Falla o no hay vivo → `POST /api/cron/radio-ingest` con `status: "no_live"` (sin
  transcript) para que la agenda lo muestre; no se reintenta en ese tick.
- Luego `ffmpeg -i <resuelta> -t <duración>` como hoy; transcripción y matcheo sin cambios.
- Workflow instala `yt-dlp` (`pip install yt-dlp`). Mismo presupuesto de minutos.
- `lib/radio-runs.ts`: `RadioRun.status` suma `"no_live"`; `markRunDone` lo acepta.

## Errores

- Franja inválida al guardar → error por línea (`error=audio:linea 3 franja inválida`), no se guarda nada del bloque.
- URL de kind incorrecto (p.ej. `kick` con URL de YouTube) → misma regla.
- `yt-dlp` ausente en el runner → el job falla ruidosamente (no silencia).
- Propuesta vieja sin `applied` → lectura tolerante; nunca rompe el render.

## Testing (vitest)

- `audio-programs`: `normalizeAudioProgram` (kind default, trims), `hasValidSlot`
  (vacío, `start >= end`, formato), `isValidUrlFor` por kind, `programsActiveAt` ignora
  franjas inválidas; parser de líneas del editor (`L-V`, `todos`, errores por línea).
- `client-brief`: mapeo de `appliedKeywordsAt/appliedMonitorAt` → `applied.*`; `audio` ausente → `[]`.
- `scenario-ai`: `audio` válido, programa inválido descartado sin tirar la propuesta, franja vacía con nota.
- `actions`: cada `guardar*` marca solo su parte; `guardarAudio` rechaza franja inválida y no persiste.
- `page`: función `resolveTab("config") === "escenario"` (extraída para test).
- Worker: `resolveStreamUrl` con `yt-dlp` mockeado (función pura en `tools/lib/` o `lib/`), decisión `no_live`.
- Radio existente: `tests/radio.test.ts` sigue verde sin cambios.

## Orden sugerido de implementación

1. `audio-programs` + compat `radio.ts` + `listening-config` (sin UI).
2. `ScenarioProposal.applied` + `audio` (lectura tolerante) + `scenario-ai` + few-shot.
3. Acciones por bloque.
4. Bloques UI + `escenario-tab` + `page.tsx` (redirect) + Informe recortado.
5. "Al aire" en Monitorear.
6. Worker: `resolveStreamUrl`, `no_live`, `yt-dlp` en el workflow.
7. Borrar `config-form.tsx`, `monitor-editor.tsx`, alias `guardarEscucha`.
