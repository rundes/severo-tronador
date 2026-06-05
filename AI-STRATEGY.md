# Severo Tronador — Estrategia de integración de IA

## 1. Por qué IA, y cómo entra

Severo Tronador es una plataforma de **investigación social y opinión pública**: toma un padrón, lo segmenta fino y orquesta contacto multicanal asistido para obtener respuestas de calidad. Hoy el producto es casi enteramente determinístico. El único uso de IA es el conector `claude-api` para análisis cualitativo de respuestas abiertas (coding inductivo/deductivo + sentiment), descrito en `ARCHITECTURE.md §5b` e implementado en `lib/connectors/claude-api.ts` con fallback heurístico local en `lib/analysis.ts`.

La oportunidad es grande, pero la IA acá **no es el producto: es una capa de asistencia**. Esta estrategia define dónde agrega valor real, cómo entra sin romper la arquitectura, y bajo qué reglas.

### Principios que gobiernan toda integración de IA

| Principio | Implicancia concreta |
|---|---|
| **Human-in-the-loop** | La IA *sugiere*, nunca ejecuta. Nunca rutea un envío, manda un mensaje ni cambia un estado sin que un humano (owner/editor) lo confirme. Toda salida de IA es un borrador editable. |
| **Costo como cuota de primera clase** | El gasto de tokens se trackea como cualquier otra cuota, vía `lib/quota.ts`, en unidad `tokens` y por `project_id`. Hay cap mensual y guardarraíles (ver `TOKEN_CAP` en `claude-api.ts`). |
| **Maximizar lo gratuito** | Default a **Claude Haiku** (barato). Sin `ANTHROPIC_API_KEY`, todo cae a heurística local — el producto funciona igual, con menos finura. |
| **Privacidad (Ley 25.326)** | Datos personales se anonimizan antes de salir hacia un tercero. El padrón crudo (DNI, nombre, teléfono, email) **nunca** sale a la API. |
| **Encuadre investigativo, no electoral** | La IA asiste investigación y comunicación institucional. Hay validación explícita de encuadre no-electoral en la redacción asistida. |
| **Calidad sobre cantidad** | La IA se usa para mejorar la *señal* (mejor pregunta, mejor segmento, mejor lectura), no para inflar volumen de contacto. |
| **Conectores, no integraciones hardcoded** | Toda capacidad de IA entra como conector `analysis` (ver `ConnectorCategory` en `lib/connectors/types.ts`) o como capa de asistencia sobre módulos existentes. El core no se toca. |

### Encaje en el modelo de conectores

La IA es un tipo de conector de categoría `analysis`, igual que `claude-api` hoy. Se registra en `lib/connectors/registry.ts`, expone `status()` / `test()` / `quota()`, y consume cuota `tokens`. Esto significa: configurable por proyecto, deshabilitable, auditable y con fallback. Ningún módulo del producto *depende* de IA para funcionar; la consume si está disponible.

---

## 2. IA por módulo del producto

Cada sección: **dolor → capability → UX (humano decide) → costo/privacidad**.

### 2.1 Padrón / Contactos

- **Dolor.** Imports CSV sucios: nombres en MAYÚSCULAS, teléfonos sin normalizar, duplicados con DNI repetido o nombres parecidos, campos faltantes.
- **Capability.** (a) Normalización (capitalización de nombres, formato E.164 de teléfonos, validación de emails); (b) **dedupe fuzzy** por similitud nombre+fecha+localidad cuando no hay DNI confiable; (c) inferencia de campos derivados (ej. sexo probable desde nombre, franja etaria desde fecha).
- **UX.** Pantalla de *staging* post-import: la IA marca filas con propuestas ("`JUAN PEREZ` → `Juan Pérez`", "posible duplicado de DNI 30.xxx"). El humano aprueba/rechaza por lote. Nada se escribe a `contactos` sin confirmación.
- **Costo/privacidad.** La mayor parte (normalización, E.164) es **determinística y local — cero tokens**. Solo el dedupe fuzzy ambiguo y la inferencia usan IA, y se puede correr con embeddings locales. Si se manda a la API, se mandan solo los campos mínimos necesarios, nunca el padrón completo.

### 2.2 Segmentación

- **Dolor.** Construir un `SegmentQuery` (árbol AND/OR/NOT, ver `lib/segment-query.ts`) a mano es potente pero tiene curva. El usuario sabe *qué* quiere ("mujeres de 40-65 de Maipú que no respondieron en 30 días"), no la sintaxis.
- **Capability.** (a) **Segmento por lenguaje natural → `SegmentQuery`**: la frase se traduce al árbol de filtros tipado; (b) sugerencia de audiencias ("estos 1.200 contactos con health alto y canal preferido email son buen target para tu encuesta").
- **UX.** Input de texto sobre el builder de segmentos. La IA **devuelve el árbol de filtros editable** — el humano lo ve renderizado en el builder visual, ajusta, y recién ahí guarda el `SavedSegment`. La IA no ejecuta el segmento, lo *propone*.
- **Costo/privacidad.** Solo se manda la frase del usuario y el **esquema de campos** (`SegmentField` de `lib/segment-query.ts`), nunca datos de contactos. Costo bajo (prompt corto, Haiku). El conteo y health-score se calculan local sobre el padrón.

### 2.3 Plantillas / Redacción

- **Dolor.** Escribir buen asunto + cuerpo, con las variables `{{nombre}}` correctas (ver `lib/interpolate-vars.ts`), en el tono justo, lleva tiempo y es desparejo.
- **Capability.** (a) Asistente de redacción asunto+cuerpo desde un objetivo; (b) **variantes A/B** (ver `lib/ab-test.ts`) generadas con un eje declarado (tono, longitud, gancho); (c) ajuste de tono y traducción; (d) **validación de encuadre no-electoral**: la IA flaggea lenguaje proselitista/partidario antes de guardar.
- **UX.** Botón "asistir" en el editor de plantillas. Genera borradores con las variables ya insertadas; el humano edita y guarda. El flag de encuadre es una advertencia, no un bloqueo automático — decide el editor.
- **Costo/privacidad.** **No toca datos de contactos** (la plantilla tiene placeholders, no valores). Costo bajísimo, default Haiku. Quick win clarísimo.

### 2.4 Campañas

- **Dolor.** Elegir canal por contacto, horario y estimar respuesta hoy es manual o por regla fija.
- **Capability.** (a) **Sugerencia de canal por contacto** apoyada en `canal preferido inferido` de la ficha de relación (`lib/relationship.ts`); (b) **mejor horario de envío** (complementa `lib/send-window.ts`); (c) predicción de probabilidad de respuesta / riesgo de opt-out por contacto.
- **UX.** En el armado de campaña, columna "canal sugerido / horario sugerido" con el *porqué* ("respondió 2 de 2 a WhatsApp"). El humano confirma el plan. **La IA nunca dispara el envío** — eso sigue pasando por la cola con cuotas, cooldowns (`COOLDOWN_DAYS`) y opt-out (`lib/optout.ts`).
- **Costo/privacidad.** La predicción puede ser un modelo estadístico local sobre el historial de relación (cero tokens) antes que un LLM. Si se usa LLM, se anonimiza: se mandan features (canal, respondió sí/no, días desde último contacto), nunca identidad.

### 2.5 Encuestas

- **Dolor.** Diseñar un buen cuestionario tipado (texto, opción única/múltiple, escala, sí/no) sin sesgar las preguntas es trabajo de oficio.
- **Capability.** (a) **Generar preguntas desde un objetivo** ("quiero medir percepción de seguridad en el barrio" → set de preguntas tipadas); (b) **detección de sesgos** en preguntas (leading questions, doble negación, opciones no exhaustivas); (c) análisis de respuestas abiertas — **ya existe**, vía `claude-api` + `lib/analysis.ts`.
- **UX.** En el builder (`app/(dashboard)/encuestas/nueva`), generar borrador de preguntas que el humano reordena/edita; el linter de sesgo marca preguntas problemáticas inline. El analista decide.
- **Costo/privacidad.** La generación no toca datos personales. El análisis de respuestas abiertas **anonimiza** antes de mandar (las respuestas pueden contener PII libre). Costo proporcional al volumen de respuestas; cap por proyecto.

### 2.6 Escucha / Listening

- **Dolor.** El feed de GDELT, RSS, X timelines y Reddit es ruido. Hoy hay detección de emergencia por volumen (`lib/emergence.ts`) y sentiment léxico (`lib/sentiment.ts`), pero falta lectura semántica.
- **Capability.** (a) **Clustering semántico** de temas emergentes (embeddings, mejor que el ratio recent/prior actual); (b) sentiment con LLM por sobre el léxico; (c) **resumen narrativo tipo "Ask Iris"**: un párrafo ejecutivo de "qué está pasando esta semana" sobre el `ListenItem` feed; (d) detección de picos con explicación ("inseguridad sube 3x, concentrado en Meta Content Library").
- **UX.** En `app/(dashboard)/escucha`, un panel "Resumen de la semana" generado, con links a las fuentes. El analista lee, no se le decide nada. Los clusters son sugerencias de agrupación editables.
- **Costo/privacidad.** Contenido público (prensa/redes) — bajo riesgo de PII propia. El resumen procesa muchos items: cachear (existe `lib/listening-cache.ts`), correr en cron, y resumir por lotes para acotar tokens.

### 2.7 Respuestas / Análisis

- **Dolor.** Cientos de respuestas abiertas que alguien tiene que leer y codificar.
- **Capability.** (a) **Coding cualitativo** inductivo/deductivo (ya en `claude-api.ts` → `CodingOutput`); (b) **resumen ejecutivo** de una campaña/encuesta (extiende el debrief de `lib/analysis.ts`, `analyzeCampaign`); (c) **alertas**: respuestas con señal urgente (queja grave, mención de riesgo) flagueadas.
- **UX.** El dashboard de cierre (`app/(dashboard)/campanas/[id]/cierre`) ya muestra temas + sentiment. Se le suma resumen narrativo y una bandeja de "respuestas que pedirías leer vos". El humano valida el coding.
- **Costo/privacidad.** **Anonimización obligatoria** — las respuestas abiertas son el dato más sensible. Sin key, cae al coding heurístico ya existente. Cuota por volumen analizado (campo `analyzed` en `Cierre`).

### 2.8 Dashboard

- **Dolor.** Para responder "¿cuántos de Maipú respondieron por WhatsApp el último mes?" hay que armar el segmento o exportar.
- **Capability.** (a) **Asistente conversacional "preguntale a tus datos"**: NL → consulta sobre métricas del proyecto; (b) **insights automáticos**: tarjetas generadas ("tu tasa de respuesta por SMS cayó 12% esta semana").
- **UX.** Caja de pregunta en `app/(dashboard)/dashboard`. La IA traduce a una query *parametrizada y segura* (reusa la maquinaria de segmentos / `lib/analytics.ts`), nunca SQL libre. Devuelve número + el filtro que usó, para que el humano lo verifique.
- **Costo/privacidad.** La IA ve esquema y agregados, **no filas individuales**. Costo bajo por consulta. Es Fase tardía: depende de que las otras piezas estén sólidas.

### 2.9 Fidelización

- **Dolor.** El health score (0-100, `lib/relationship.ts`) es un número opaco; el operador no sabe *qué hacer* con un contacto.
- **Capability.** (a) **Explicación del health score** en lenguaje natural ("bajó porque no respondió a los últimos 3 contactos de email"); (b) **próxima mejor acción** por contacto, respetando cooldowns y opt-outs ("disponible para WhatsApp en 4 días; es su canal con mejor respuesta").
- **UX.** En la ficha de contacto (`app/(dashboard)/contactos/[dni]`), una línea de explicación y una sugerencia de acción. La acción es un *atajo propuesto*, no una ejecución. Respeta `nextAvailableAt` y `optOuts`.
- **Costo/privacidad.** La explicación puede ser **template-driven sin LLM** (la ficha ya tiene los datos estructurados) → cero tokens en el caso base. LLM solo para fraseo más rico; en ese caso se manda la ficha derivada anonimizada, no la identidad.

### 2.10 Operación / Auditoría

- **Dolor.** Configurar conectores (tokens, scopes, webhooks) es propenso a error; las anomalías operativas se ven tarde.
- **Capability.** (a) **Asistente de configuración de conectores** (interpreta errores de `test()`, sugiere el fix); (b) **detección de anomalías** sobre el log de auditoría (`lib/audit.ts`) — pico de bounces, opt-outs anómalos, gasto de tokens disparado.
- **UX.** En `app/(dashboard)/conectores`, mensajes de error accionables. En `app/(dashboard)/auditoria`, alertas. Siempre informativo; el owner decide.
- **Costo/privacidad.** Logs operativos, sin PII de contactos. Costo marginal.

---

## 3. Modelo de conectores de IA

Toda capacidad nueva de IA se agrega como **conector `analysis`** (no como dependencia del core), siguiendo el contrato de `lib/connectors/types.ts` (`AnalysisConnector`, `AnalysisTask`, `AnalysisResult`) y el patrón de `lib/connectors/claude-api.ts`.

### Proveedores

| Proveedor | Rol | Notas |
|---|---|---|
| **Claude API (Haiku)** | Default para texto: redacción, NL→query, NL→segmento, coding, resumen | Barato; `TOKEN_CAP` mensual como guardarraíl |
| **Claude API (Sonnet/Opus)** | Opt-in para tareas que lo justifiquen (resumen narrativo grande) | Solo si el proyecto lo habilita; mayor costo de tokens |
| **Embeddings** | Clustering de listening, dedupe fuzzy, sugerencia de audiencias | Puede correr local (sin key) o vía API |
| **Heurística local** | Fallback universal sin `ANTHROPIC_API_KEY` | Ya implementado para coding/sentiment; el producto nunca se rompe |

### Tracking de costo

- Cada conector de IA incrementa cuota vía `incrementUsage(connectorId, tokens, projectId)` (`lib/quota.ts`), unidad **`tokens`**, por `project_id`.
- Se chequea cuota **antes** de la llamada (igual que los envíos), no después.
- La pantalla de Conectores muestra tokens usados / cap, con reset mensual (`nextMonthlyReset`).
- Cada feature de IA declara un *budget* estimado por operación, visible antes de ejecutar ("este análisis va a consumir ~X tokens").

---

## 4. Privacidad y gobernanza

| Aspecto | Regla |
|---|---|
| **Datos que NUNCA salen** | DNI, nombre completo, teléfono, email, dirección. El padrón crudo no se manda a ninguna API de terceros. |
| **Anonimización** | Antes de mandar respuestas abiertas o features de contacto, se strip-ea/pseudonimiza PII. Se mandan IDs internos o features agregadas, no identidad. |
| **Human-in-the-loop** | Toda salida de IA es borrador. Ninguna acción de contacto (envío, ruteo, cambio de estado) la decide la IA. |
| **Versionado de prompts** | Cada prompt vive en código versionado (`lib/...`), con id y versión. Las salidas guardan qué prompt+modelo las generó. |
| **Auditoría de salidas** | Las generaciones de IA que afectan decisiones (segmento sugerido, coding aplicado) se loguean en `lib/audit.ts`: input hash, modelo, tokens, usuario que confirmó. |
| **Ley 25.326** | Datos personales de Argentina: finalidad declarada (investigación), minimización, derecho de supresión respetado. La IA no amplía la finalidad del dato. |
| **Encuadre no-electoral** | Validación automática en redacción; la plataforma asiste investigación/comunicación, no campaña partidaria. |

---

## 5. Roadmap por fases

Ordenado por **valor / esfuerzo**. Arranca por lo que ya existe y los quick wins sin riesgo de privacidad.

| Fase | Entregable | Por qué acá | Esfuerzo |
|---|---|---|---|
| **AI-F1** | Consolidar análisis cualitativo existente (`claude-api` + `lib/analysis.ts`): cuota en tokens, anonimización formal, resumen ejecutivo en el cierre | Ya está el 80%; cerrar gobernanza y cuota | Bajo |
| **AI-F2** | **Asistente de redacción de plantillas** (asunto+cuerpo, A/B, tono, validación no-electoral) | Quick win: sin datos personales, costo mínimo, valor visible inmediato | Bajo |
| **AI-F3** | **Segmento por lenguaje natural → `SegmentQuery`** + sugerencia de audiencias | Alto valor, sin PII (solo esquema), apalanca `lib/segment-query.ts` | Medio |
| **AI-F4** | **Listening con clustering semántico + resumen "Ask Iris"** + sentiment LLM | Convierte ruido en señal; datos públicos, bajo riesgo | Medio |
| **AI-F5** | Padrón: dedupe fuzzy + normalización asistida en staging de import | Valor operativo alto; lo determinístico va antes que el LLM | Medio |
| **AI-F6** | Fidelización: explicación de health score + próxima mejor acción | Apalanca `lib/relationship.ts`; arranca template-driven sin tokens | Medio |
| **AI-F7** | Campañas: sugerencia de canal/horario + predicción de respuesta | Requiere historial de envíos real acumulado primero | Medio-Alto |
| **AI-F8** | Encuestas: generación de preguntas + linter de sesgos | Valor de oficio; depende de feedback de AI-F2 en redacción | Medio |
| **AI-F9** | **Dashboard "preguntale a tus datos"** + insights automáticos | El más ambicioso; conviene último, sobre piezas ya sólidas | Alto |
| **AI-F10** | Operación: asistente de config de conectores + detección de anomalías en auditoría | Pulido operativo, no bloquea el resto | Bajo-Medio |

---

## 6. Métricas de éxito

| Métrica | Qué mide |
|---|---|
| **Adopción de sugerencias** | % de borradores de IA (plantilla, segmento, acción) que el humano acepta o edita levemente vs descarta. Señal de calidad real. |
| **Tiempo a la acción** | Reducción de tiempo para armar un segmento / redactar una campaña / codificar respuestas vs línea base manual. |
| **Calidad de respuesta** | Tasa de respuesta de campañas con canal/horario sugerido por IA vs default. |
| **Costo por insight** | Tokens consumidos / decisión asistida. Debe mantenerse bajo (default Haiku). |
| **Cobertura de fallback** | % de tareas que siguen funcionando sin `ANTHROPIC_API_KEY`. Objetivo: 100% degradan, nunca rompen. |
| **Higiene de privacidad** | 0 incidentes de PII cruda enviada a terceros (auditable en `lib/audit.ts`). |
| **Precisión percibida** | En coding/clustering, acuerdo entre etiquetas de IA y revisión humana (muestreo). |

---

> La IA en Severo Tronador es un asesor, no un piloto automático. Entra como conectores, gasta como cuota, respeta la privacidad por diseño y siempre deja la decisión final en una persona.
