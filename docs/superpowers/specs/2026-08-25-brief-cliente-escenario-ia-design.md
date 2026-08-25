# Brief del cliente → escenario generado con IA

**Fecha:** 2026-08-25 · **Estado:** aprobado (diseño) · **Ámbito:** /escucha (tab Informe y Configurar), `lib/`, sin DDL.

## Problema

Hoy el operador define qué se busca de un cliente cargando a mano cuentas de
redes (`handle, plataforma, categoría`) y palabras sueltas (keywords, búsquedas
A/B). Eso exige que el operador ya sepa traducir el problema del cliente a
términos de búsqueda, y no deja rastro de *por qué* se busca lo que se busca.
El escenario FERRO (seed) muestra el resultado deseado: keywords en dos capas,
búsquedas simétricas, cuentas institucionales verificables, entidades para no
confundir, calendario. Ese resultado tiene que salir de un **contexto** que el
operador escribe en lenguaje natural y que crece con el tiempo.

## Decisiones

- **Brief libre y acumulativo, append-only.** Aportes fechados con autor. No se
  reescribe la historia; se puede quitar una entrada.
- **La IA propone, el operador aplica.** Nada generado se guarda como vigente
  sin un Guardar explícito en los editores actuales.
- **Cada barrida (informe diario) sugiere nuevos actores.** Se incorporan con
  un click, nunca solos (spec FERRO §9.2: no atribuir sin evidencia).
- **Sin DDL.** Todo vive en `conector_config` como filas sintéticas por
  proyecto, igual que `monitor-config:<projectId>`.

## Datos

Fila `conector_config` con `connector_id = brief:<projectId>`, `project_id = NULL`:

```ts
interface BriefEntry { id: string; at: string; by: string; text: string }

interface ScenarioProposal {
  at: string;                 // cuándo se generó
  briefHash: string;          // sha256 del brief usado → detecta brief cambiado
  tipo: "electoral" | "territorial";
  resumen: string;            // 3-5 líneas del modelo: cómo leyó el brief
  keywords: string[];         // ≤ 16, amplias primero (gdelt-worker lotea de a 7)
  searchesA: string[];
  searchesB: string[];
  accounts: MonitorAccount[]; // siempre nota: "verificar handle"
  entidades: Record<string, string>;
  calendar: CalendarEvent[];
  appliedAt?: string;
}

interface ActorSuggestion {
  id: string;                 // `${platform}:${handle}` normalizado
  handle: string;
  platform: Platform;
  category: Category;
  direccion: "A" | "B" | "?";
  evidencia?: string;         // url de la mención que lo motivó
  razon: string;
  suggestedAt: string;        // fecha de la barrida
  status: "pending" | "accepted" | "dismissed";
}

interface ClientBrief {
  entries: BriefEntry[];
  proposal?: ScenarioProposal;
  suggestions: ActorSuggestion[];
}
```

Lo vigente sigue donde está: keywords en `listening_config`, el resto en
`monitor-config:<projectId>`. `noRepetir` y `budget` no los toca la IA.

## Flujo

```
operador agrega aporte ──► brief.entries (append)
                              │
        "Generar escenario con IA" (editor+)
                              ▼
 lib/scenario-ai.proposeScenario(projectId)
   prompt = brief completo + escenario vigente + few-shot FERRO + reglas
   respuesta = bloque ```json``` → zod → brief.proposal (no aplica)
                              │
 editores (Escenario, Configurar) prellenados con la propuesta + diff
                              │
        Guardar ──► listening_config.keywords / monitor-config
                    brief.proposal.appliedAt = now
```

```
cron/daily-report ──► generateDailyReport
   prompt += "## Brief del cliente" (todas las entradas)
   prompt += "al final, bloque ```json``` { nuevosActores: [...] }"
   markdown = respuesta sin el bloque; nuevosActores → brief.suggestions
   (dedupe: fuera los que ya están en accounts, los accepted y los dismissed)
                              │
 UI "Actores sugeridos (N)" ──► Incorporar → monitor.accounts (+ nota)
                            ──► Descartar → status dismissed (no vuelve)
```

## Módulos

| Módulo | Responsabilidad | Depende de |
| --- | --- | --- |
| `lib/client-brief.ts` | leer/guardar `ClientBrief`; `addEntry`, `removeEntry`, `briefText()`, `briefHash()`, `setProposal`, `markApplied`, `upsertSuggestions`, `setSuggestionStatus` | `db/supabase` |
| `lib/scenario-examples.ts` | constante `FERRO_EXAMPLE` (brief de ejemplo + salida JSON esperada), tomada del seed | — |
| `lib/scenario-ai.ts` | `buildScenarioPrompt(brief, current)`, `parseScenarioJson(text)`, `proposeScenario(projectId)` | `anthropic`, `client-brief`, `monitor-config`, `listening-config`, `connectors/config` (API key Claude) |
| `lib/daily-report.ts` (cambio) | inyecta brief al prompt; pide y separa `nuevosActores`; llama `upsertSuggestions` | `client-brief` |
| `lib/monitor-config.ts` (fix) | `saveMonitorConfig` con `onConflict: "connector_id,project_id"` y `project_id: null` | — |
| `app/(dashboard)/escucha/actions.ts` (nuevas) | `agregarAporteBrief`, `quitarAporteBrief`, `generarEscenarioIA`, `descartarPropuesta`, `resolverActorSugerido(id, accepted)`; `guardarMonitor` y `guardarConfig` marcan la propuesta aplicada | los de arriba |
| `components/escucha/brief-panel.tsx` | aportes + form + botón generar + banner de propuesta | actions |
| `components/escucha/actor-suggestions.tsx` | tabla de sugeridos con Incorporar/Descartar | actions |
| `components/escucha/monitor-editor.tsx` (cambio) | acepta `proposal?`; prellena y muestra diff por campo; botón Descartar propuesta | — |
| `components/escucha/config-form.tsx` (cambio) | aviso + keywords prellenadas si hay propuesta pendiente | — |

## Prompt de escenario (contrato)

- **System:** reglas editoriales de `daily-report` (hecho vs inferencia, §9.2) +
  "Sos el analista que arma el escenario de monitoreo. Devolvé SOLO un bloque
  ```json``` con el esquema dado."
- **User:** `## Ejemplo (FERRO)` brief + JSON esperado · `## Escenario vigente`
  (para que conserve lo que sigue valiendo y no invente de cero) · `## Brief
  del cliente` entradas en orden `[fecha · autor] texto` · `## Reglas`:
  keywords ≤ 16, amplias primero, ≥ 3 amplias del territorio/agenda y ≥ 3
  específicas del cliente; búsquedas A y B simétricas (mismo número); cuentas
  solo si el brief o el vigente las nombran, siempre `nota: "verificar
  handle"`, categoría según la taxonomía; entidades para lo que se pueda
  confundir; calendario solo con fechas explícitas del brief; `tipo` electoral
  si hay elección/lista/asamblea, territorial si no.
- **Parseo:** primer bloque ```json``` → `zod.safeParse(ScenarioSchema)`.
  Falla → `{ ok: false, error }`, se muestra en el panel, no se guarda.
- `maxTokens` 2000. Modelo/API key: los del conector Claude del proyecto
  (`getConnectorConfig(CLAUDE_ID, projectId)`), como el informe.

## Informe diario (cambio de contrato)

- Nueva sección `## Brief del cliente` antes de `## Contexto del cliente`.
- Nueva instrucción al final: "Cerrá con un bloque ```json``` con
  `{ "nuevosActores": [{ handle, platform, category, direccion, evidencia,
  razon }] }`. Solo cuentas que aparecen en las menciones de arriba y no están
  en el plan. Si no hay, `[]`."
- `splitReport(text) → { markdown, nuevosActores }`. Sin bloque o inválido:
  markdown completo, `[]`, `log.warn`. El informe nunca falla por esto.

## UI (tab Informe, de arriba a abajo)

1. **Contexto del cliente**: lista `fecha · autor · texto` con "quitar"
   (editor+); textarea "Agregar aporte" + Guardar; botón **Generar escenario
   con IA** (editor+; deshabilitado con hint si falta API key de Claude o el
   brief está vacío). Banner cuando hay `proposal` sin `appliedAt`:
   "Propuesta del <fecha> sin aplicar — <resumen>"; si `briefHash` ≠ hash
   actual, agrega "el brief cambió desde esta propuesta".
2. **Actores sugeridos (N)** solo si hay `pending`: tabla `handle · plataforma
   · categoría · dirección · evidencia → · razón · [Incorporar] [Descartar]`.
3. **Escenario de monitoreo** (editor actual): con propuesta pendiente,
   textareas prellenados con la propuesta y encima de cada uno
   `vigente N → propuesto M (+a −b)`; botón secundario "Descartar propuesta".
   Guardar aplica y marca `appliedAt`.
4. **Configurar → Keywords**: mismo aviso y prellenado; Guardar aplica solo
   keywords (la propuesta queda "parcialmente aplicada" hasta que también se
   guarde el escenario; el banner lo dice).

## Errores

- Sin DB → como hoy (503 / botones deshabilitados).
- Sin API key de Claude → botón deshabilitado + hint.
- JSON inválido → mensaje "La IA devolvió algo que no pude interpretar; probá
  de nuevo" + log con los primeros 300 chars.
- Aporte vacío → validación en la action.
- Concurrencia: dos operadores agregando aportes → última escritura gana sobre
  la fila entera (aceptado; mismo comportamiento que `monitor-config`).

## Fix incluido (targeted)

`saveMonitorConfig` usa `onConflict: "connector_id"` contra una unique
`(connector_id, project_id) NULLS NOT DISTINCT` → Postgres 42P10, idéntico al
bug del token (`f86b3e8`). "Guardar escenario" hoy falla. Se corrige con
`onConflict: "connector_id,project_id"` y `project_id: null`, con test.

## Testing (vitest, mocks como los existentes)

- `client-brief`: append conserva orden y autor; remove por id; `briefText`
  formatea `[fecha · autor] texto`; `briefHash` estable; `upsertSuggestions`
  dedupe contra accounts/accepted/dismissed; `setSuggestionStatus`.
- `scenario-ai`: prompt contiene brief, vigente y FERRO; `parseScenarioJson`
  con bloque válido, sin bloque, JSON roto, keywords > 16 (recorta), cuentas
  sin nota (agrega "verificar handle"), A/B desiguales (rechaza).
- `daily-report`: `splitReport` separa markdown y actores; sin bloque → `[]`;
  el prompt incluye el brief.
- `monitor-config`: `saveMonitorConfig` llama upsert con onConflict correcto.
- actions: `resolverActorSugerido(accepted)` agrega a accounts con nota;
  `guardarMonitor` marca `appliedAt`.

## Fuera de alcance

Auto-incorporar actores; consolidación IA del brief ("resumen vigente");
cambios en la extensión de Chrome; versionado/undo de propuestas aplicadas.
