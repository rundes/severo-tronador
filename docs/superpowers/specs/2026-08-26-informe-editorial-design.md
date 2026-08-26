# Informe editorial: brief maestro como fuente de verdad, informe con tesis y estructura fija

**Fecha:** 2026-08-26 · **Estado:** aprobado (diseño) · **Sub-proyecto 2 de 3** (antes: barrido con IA; después: diseño + identidad por proyecto).
**Ámbito:** `lib/client-brief.ts`, `lib/daily-report.ts`, `lib/report-markdown.ts`, `lib/report-html.ts`, `lib/pdf/daily-report-pdf.tsx`, `components/escucha/{report-view,brief-panel,informe-panel}.tsx`, `app/(dashboard)/escucha/actions.ts`. Sin DDL (todo vive en `conector_config`).
**Referencias:** `~/Downloads/BRIEFmonitoreoferro.md` (brief maestro, 25 KB, 12 secciones) y `~/Downloads/informeferro20260826.html` (informe objetivo).

## Problema

El informe diario actual es un resumen genérico ("Resumen ejecutivo / Temas del día / Menciones destacadas…") armado desde keywords, menciones y métricas. El informe de referencia es **editorial**: un título que es una tesis, una bajada, cuenta regresiva en días, secciones numeradas con narrativa, inferencias etiquetadas, tablas comparativas dentro de cada categoría, vigilancia con plazos y fuentes. La diferencia no es solo el prompt: el modelo de referencia trabaja con un **brief maestro** (mapa de actores con seguidores y vínculos, métricas ya medidas, hallazgos establecidos que no se re-derivan, errores a no repetir, reglas editoriales, vigilancia del día) que hoy el panel no puede recibir: el brief es una lista de aportes cortos.

## Decisiones

1. **Brief maestro como documento.** `ClientBrief` suma `master?: { text: string; updatedAt: string; by: string }` — Markdown libre, hasta 60.000 caracteres. Los `entries` (aportes) siguen existiendo como notas incrementales entre versiones del maestro. `briefText(brief)` = maestro + aportes (en ese orden). En el panel: pestaña "Brief maestro" con textarea grande (monoespaciada) e **importar `.md`** (input file, lectura en cliente, se pega en el textarea) + Guardar; los aportes quedan como hoy debajo.
2. **El maestro manda sobre la config del panel.** En el prompt, el brief maestro va primero y completo; la config (zona, keywords, cuentas, hitos, métricas medidas por el sistema) va después como "datos del sistema". Si se contradicen, el modelo prioriza el brief para contexto y los datos del sistema para cifras medidas hoy.
3. **Estructura editorial fija del informe** (secciones del §8.1 del brief de referencia), en este orden y con estas convenciones Markdown que el parser entiende:
   - `# Título` = **tesis del día** (una oración con sujeto y consecuencia; nunca "Informe diario").
   - Primer párrafo después del `#` = **bajada** (3-5 líneas). El parser lo tipa como `bajada`.
   - `## 01 El escenario` … `## NN` — secciones numeradas de dos dígitos. Nombres fijos: 01 El escenario · 02 Lo que cambió · 03 Línea de tiempo · 04 Contenido efímero · 05 Top 5 de discusiones · 06 Tono y densidad por agrupación · 07 Mapa por categorías · 08 Cuentas nuevas y cuentas que operan · 09 Normativo y calendario · 10 Vigilancia · Fuentes. Si una sección no tiene material, el modelo la incluye con una línea ("Sin novedades en el período") — nunca la omite.
   - **Cuenta regresiva**: bloque cercado ```` ```countdown ```` con una línea por hito `días | etiqueta | detalle`. Lo escribe **el código**, no el modelo: `countdownBlock(monitor.calendar, now)` con todos los hitos futuros ordenados; se inserta al inicio de "01 El escenario". El modelo recibe los hitos en días y solo los narra.
   - **KPIs**: bloque ```` ```kpi ```` con líneas `valor | etiqueta | nota` (máx. 4). El modelo lo usa en "02 Lo que cambió" con los 3-4 números del día.
   - **Inferencias**: párrafo que empieza con `**Inferencia**` → bloque `callout` kind `inferencia`. `**Advertencia**` → `advertencia` (declaraciones no verificadas, rumores). Regla: toda lectura que no sea dato medido va en una inferencia.
   - Tablas Markdown como hoy; `Top 5` es una tabla `# | Tema | Origen | Alcance | Amplificadores`; `Tono y densidad` es una tabla con una columna por agrupación; `Vigilancia` es `# | Qué vigilar | Por qué | Cuándo`.
   - `## Fuentes`: lista de URLs citadas (solo las que aparecen en las menciones o en el brief).
   - **Proyectos sin escenario electoral** (sin cuentas ni hitos cargados, p. ej. Ibicuy): estructura reducida `01 El escenario · 02 Lo que cambió · 03 Línea de tiempo · 04 Top 5 de discusiones · 05 Vigilancia · 06 Sugerencia operativa · Fuentes`. `reportSections(electoral)` es la única fuente de la lista, usada por el prompt y por `missingSections`. (Decisión tomada en review, 2026-08-26.)
4. **Prompt nuevo.** System: reglas editoriales del brief de referencia (hecho vs inferencia; acusación = declaración pública; no atribuir sin evidencia; tracción a 24 h; el informe no habla de sí mismo; sin nómina de particulares; **no comparar alcance entre categorías**; cuenta regresiva en días; hora argentina; resultado deportivo apaga ~12 h). User: brief maestro + aportes → datos del sistema (proyecto, zona, hitos en días, cuentas por categoría con vínculo, métricas por cuenta incl. historias vivas y última pieza, menciones 24 h y muestra 7 d, informe anterior 3.000 chars, memoria de errores, entidades) → estructura obligatoria (sección por sección, con qué va en cada una) → bloque JSON interno. `maxTokens` 8000.
5. **Cierre: propuesta de actualización del brief (§11).** El JSON interno suma `briefUpdates: [{ seccion: string, texto: string }]` (máx. 8): hechos nuevos que deberían entrar al maestro (cuenta nueva con seguidores, hito confirmado, hallazgo roto, error detectado como regla). Se guardan en `brief.pendingUpdates` con `status: pending|accepted|dismissed`; el panel las lista bajo el maestro con **Aceptar** (se agrega como aporte `[informe AAAA-MM-DD · §sección] texto`) o **Descartar**. Nunca se edita el maestro solo.
6. **Render.** `report-markdown` suma bloques `bajada`, `countdown` (cards `{days,label,detail}`), `kpi` (cards `{value,label,note}`), `callout` (`{kind, text}`); los tres renderers (panel, mail HTML, PDF) los dibujan con el diseño actual (zinc + índigo). La identidad por proyecto (escudo, verde Ferro, tipografía) es el sub-proyecto 3.
7. **Mail.** El asunto pasa a ser el título-tesis: `Ferro · {título}` (hoy "Informe diario …"). El cuerpo del mail lleva la bajada arriba del informe.
8. **Fuera de alcance:** Drive, `estado.json`, PDF ≤10 páginas garantizado, screenshots de historias, ejercicio "si yo condujera la campaña" (solo si el brief lo pide: el modelo lo agrega como sección 11).

## Datos

```ts
interface ClientBrief {
  entries: BriefEntry[];
  master?: { text: string; updatedAt: string; by: string };
  pendingUpdates?: BriefUpdate[];       // nuevo
  proposal?: ScenarioProposal;
  suggestions: ActorSuggestion[];
}
interface BriefUpdate { id: string; seccion: string; texto: string; reportAt: string; status: "pending" | "accepted" | "dismissed" }
```

Bloques nuevos del parser:

```ts
| { t: "bajada"; text: Inline[] }
| { t: "countdown"; items: { days: number; label: string; detail: string }[] }
| { t: "kpi"; items: { value: string; label: string; note: string }[] }
| { t: "callout"; kind: "inferencia" | "advertencia"; text: Inline[] }
```

## Errores

- Maestro > 60.000 chars → la acción devuelve `brief_error=too_long`, no guarda.
- Modelo no respeta la estructura → el parser es tolerante (todo lo no reconocido sigue siendo `p`/`h`); el informe se guarda igual. Se loguea `daily_report.structure_missing` con las secciones ausentes (por regex `^## \d\d`).
- `briefUpdates` inválido → se ignora, el informe se guarda.
- Countdown sin hitos → no se inserta el bloque; el prompt dice "sin hitos cargados".

## Testing (vitest)

- `tests/report-markdown.test.ts`: bajada tras h1; ```countdown``` y ```kpi``` parsean y toleran líneas malformadas; `**Inferencia**`/`**Advertencia**` → callout; párrafo normal no es callout.
- `tests/report-html.test.ts` + `tests/daily-report-pdf.test.ts`: los bloques nuevos rinden (contienen días/etiqueta, clase de callout).
- `tests/daily-report-split.test.ts`: `briefUpdates` se extrae; inválido se ignora; `countdownBlock` ordena y filtra pasados.
- `tests/client-brief.test.ts`: `briefText` con maestro + aportes; `mergeBriefUpdates` dedupe por `seccion+texto`; `setBriefUpdateStatus`.
- `tests/escucha-brief-actions.test.ts`: `guardarBriefMaestro` límite y guardado; `resolverBriefUpdate` acepta → aporte.
- `tests/daily-report-email.test.ts`: asunto con el título-tesis.
