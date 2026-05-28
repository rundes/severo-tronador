# Plan 02 — Diseño avanzado de Segmentos + Campañas por canal

> Estado: P0/P1/P2 cerrados (ver `docs/STABILIZATION.md`). El producto
> ya envía multicanal, encola async, valida datos y observa. Lo que sigue
> es **densidad de feature**: hacer que el constructor de segmentos pueda
> expresar matices reales del padrón, y que cada canal tenga su editor
> específico en vez de un form genérico.
>
> Fuente: VISION §3 (calidad sobre cantidad) + ARCHITECTURE §6 (segment
> builder) + PROVIDERS.md (constraints por canal).

## Filosofía

- **Segmentos = audiencias guardadas**, no filtros descartables. Si vale la
  pena segmentar, vale la pena nombrar y volver a usar.
- **Canales son ciudadanos de primera clase**: cada uno tiene su editor,
  no un form que cambia 2 labels. Email tiene asunto + preview; WhatsApp
  tiene template aprobado; SMS tiene 160 chars; voz tiene guion TTS.
- **El sistema sabe lo que va a hacer antes de hacerlo**: preview de costo,
  preview de mensaje, preview de cuántos contactos sobreviven a cada filtro.

---

## Fase 1 — Segment builder v2 (`/segmentos`)

### 1.1 Multi-condición con grupos AND/OR

Hoy: 5 filtros independientes (sexo, barrio, edad, healthMin). Todos en AND
implícito.

Próximo: grupos arbitrarios.

```
( sexo=F AND edad ∈ [40, 65] )
  AND
( barrio ∈ {Centro, Norte} OR circuito=12 )
  AND NOT
( opt_out OR último_envío < 7d )
```

UI: cada grupo es una "tarjeta" con `+` / `−` para condiciones. Toggle AND/OR.
Backend: árbol serializable, `SegmentFilter` se reemplaza por
`SegmentQuery = { combinator: "AND"|"OR", conditions: (Condition|SegmentQuery)[] }`.

### 1.2 Persistencia + reutilización

Tabla `segmentos` ya existe. Hoy nadie escribe ahí.

Acciones:
- `guardarSegmento(nombre, query)` — server action desde `/segmentos`.
- Lista guardados en sidebar: cliquear → carga la query en el builder.
- `/campanas/nueva` selecciona "segmento guardado" en vez de re-armar.

### 1.3 Filtros nuevos

| Filtro | Por qué |
|---|---|
| `respondió_en_últimos_N_días` | Identificar activos vs latentes |
| `último_contacto > N días` | "No molesté hace tiempo, va de nuevo" |
| `responde_por_canal = X` | Routing inteligente (la persona responde solo por WhatsApp) |
| `tiene_email` / `tiene_telefono` | Contactabilidad efectiva por canal |
| `healthBand ∈ {green, yellow}` | Filtro de salud agregado, no solo min |
| `circuito ∈ [...]` / `mesa ∈ [...]` | Granularidad territorial fina |
| `género=F AND edad ≥ 60` (cross) | Demo combinada |
| **NOT** (excluir set) | Sub-restar otra audiencia (ej: "todos menos el segmento ya contactado") |

### 1.4 Vista previa progresiva

Cada filtro muestra "cuántos sobreviven" en tiempo real. Hoy se ve el total
final; lo útil es ver el embudo: 10.000 → 4.200 (sexo=F) → 1.800 (edad 40-65)
→ 1.200 (barrio Centro) → 800 (con email).

Implementación: cada condición renderiza su delta. Si el filtro elimina >70%
del set, sugerir relajarlo.

### 1.5 Export CSV

Botón "Bajar lista (CSV)" en `/segmentos` cuando el segmento está aplicado.
Útil para llamados manuales (importar a planilla externa) o auditoría.

### 1.6 Estimación de costo y cuota

Mostrar al lado del contador total:

```
800 personas
  📧 Email:    800 envíos · $0.00 (Resend free)
  💬 WhatsApp: 800 conversaciones · $0.00 (Meta free, dentro de 1k)
  📱 SMS:      800 envíos · $32.00 (Telnyx ~$0.04/SMS)
  ☎️ Voz:      800 llamadas · estimado 2 min c/u → $6.40
```

Pulled de `connector.estimateQuotaImpact()` ya existente. UI agrega cost
breakdown por canal.

---

## Fase 2 — Campañas con editor por canal (`/campanas/nueva/[channel]`)

Hoy: form genérico que cambia solo el label de "Plantilla". Si elegís email
muestra asunto; si elegís otro no. Nada del resto del canal.

Próximo: ruta dedicada por canal con editor específico.

### 2.1 Editor Email — `/campanas/nueva/email`

- **Asunto** con preview de bandeja (sender + asunto + preview text).
- **Preview text** (primeras 80 chars que ve el cliente antes de abrir).
- **A/B testing** (variante A / B con % split, métrica = open rate o respuesta).
- **Send-window** ("entre 09:00 y 21:00 hora local").
- **Throttle por minuto** (60/min default, configurable hasta el rate limit
  de Resend).
- **Preview de un destinatario real** (random del segmento) con
  variables interpoladas.

### 2.2 Editor WhatsApp — `/campanas/nueva/whatsapp`

- **Selector de template aprobado** (Meta-side). Lista pulled vía Graph
  API si hay creds; fallback a "ingresar template name manual".
- **Mapping de variables**: `{{1}}` → `nombre`, `{{2}}` → `barrio`, etc.
  Con preview.
- **Idioma** (`es_AR`, `es`, `en_US`...) selector.
- **Modo 24h**: si la persona escribió hace <24h, se puede mandar texto libre
  en vez de template. UI flag: "este segmento contiene N personas en
  ventana 24h".
- **Send-window** + **throttle**.

### 2.3 Editor SMS — `/campanas/nueva/sms`

- **Contador GSM-7 / UCS-2** (160 chars una sola parte, 153 multiparte,
  70 chars si hay emoji/acento). Mostrar costo por destinatario según
  segments necesarios.
- **Sender ID** (alfanumérico vs numérico, depende del país).
- **Throttle agresivo por defecto** (10/seg) para no quemar Telnyx.

### 2.4 Editor Voz — `/campanas/nueva/voice`

- **Guion TTS** editable con marcadores `<pause>`, énfasis. Preview con
  TTS pre-render del audio (Telnyx TTS o gTTS si hay).
- **Política de retry**: 1 intento / 2 intentos espaciados / dejar mensaje
  en buzón.
- **Send-window**: respeta horario hábil (09:00-21:00 local). Llamada
  nocturna = ofensa real.
- **Captura de respuestas** (DTMF si hay encuesta cerrada,
  conversational si hay agente IA / connector bland-ai en F5+).

### 2.5 Shared: scheduling

- **Send now** vs **Schedule for** (datetime picker).
- **Recurring drip** (Fase 3 abajo).

---

## Fase 3 — Drip / multi-step campaigns

Una campaña hoy es un disparo. Una campaña real suele ser una secuencia:

1. Día 0 — Invitación por WhatsApp
2. Día 3 — Si no respondió, recordatorio por email
3. Día 7 — Si no respondió, llamada
4. Día 10 — Agradecimiento (a los que sí respondieron)

Implementación:
- Nueva entidad `flow`: lista ordenada de `flow_step` con `delay_days`,
  `channel`, `template`, `condition`.
- `executeCampaign` hoy crea N envíos. Una flow crea N×steps con
  `scheduled_at` calculado.
- Cron `send-queue` ya respeta `scheduled_at` (#10 ya hecho).
- UI: `/campanas/nueva/flow` con timeline editor.

---

## Fase 4 — Personalización y variables expandidas

Hoy hay `{{nombre}}`, `{{barrio}}`, `{{encuesta_url}}`. Faltan:

- `{{barrio_obj}}` — diminutivo / variante coloquial del barrio
- `{{saludo}}` — "Hola María" vs "Buenos días" por hora del día
- `{{firma}}` — firma del equipo configurable por env
- `{{fecha_humana}}` — "el martes próximo" en vez de "2026-06-02"
- `{{ultima_pregunta}}` — referenciar la última respuesta del contacto
  ("la vez pasada nos contaste sobre el transporte; queríamos preguntarte…")
- Custom: cualquier columna del padrón.

Validación: si una plantilla referencia `{{x}}` y la persona no tiene `x`,
caer a un default seguro o saltar el envío. Hoy se interpola con literal
faltante (`{{barrio}}` queda sin reemplazar).

---

## Fase 5 — Send-window, throttle, dignidad

Regla operativa (que también es ética): **no contactar a las 03:00**. Hoy
nada lo impide.

- `send_window` en `campañas`: ventana horaria global.
- Cron `send-queue` chequea hora local del destinatario (`pais` del padrón
  o default del territorio config) y reprograma fuera de la ventana.
- `throttle_per_minute` por conector: el cron procesa BATCH respetando esto.
- **Frecuencia máxima por canal** ya implementada (cooldown). Sumar
  **frecuencia máxima cross-canal** (ej: no más de 2 toques/mes total).

---

## Fase 6 — Auditoría + métricas agregadas

Hoy solo loguear (#15). Persistir:

- Cada campaña creada → fila en `audit_log` (quién la creó, qué segmento,
  qué template, scheduled_at).
- Vista `/dashboard/auditoria` con timeline filtrable por usuario / fecha.
- Métricas agregadas por **campaña**: open rate, response rate, opt-out
  rate, cost. Comparables entre campañas.
- Métricas por **contacto**: total toques, respuestas, último canal
  exitoso. Ya derivable hoy desde `relations.ts`, falta exponer.

---

## Orden sugerido

1. **F1.2 — Persistir segmentos** + **F1.5 — Export CSV** (más cortas, alta
   utilidad inmediata).
2. **F1.1 — Multi-condición AND/OR + F1.3 — Filtros nuevos** (cuore del
   plan, ~1 sesión grande).
3. **F1.4 — Embudo progresivo + F1.6 — Estimación de costo** (UI sobre
   lo del paso 2).
4. **F2 — Editores por canal** (4 rutas dedicadas, en orden Email →
   WhatsApp → SMS → Voz).
5. **F5 — Send-window + throttle** (necesario antes de cualquier campaña
   real grande).
6. **F4 — Variables expandidas** (cuando empiecen a faltar en plantillas
   reales).
7. **F3 — Drip flows** (después de probar campañas single-step).
8. **F6 — Auditoría + métricas** (cuando haya volumen suficiente para
   comparar).

---

## Dependencias técnicas

- F1.1 → migración nueva: `segmentos.filtros` ya es `jsonb`, alcanza
  cambiar el shape. Migrar segmentos existentes (hoy ninguno) con un
  script idempotente.
- F2.2 → leer templates aprobados de Meta vía Graph API o CSV upload manual.
  Mientras tanto, lista hardcoded a 2-3 templates conocidos.
- F3 → tabla `flows` + `flow_steps`. Migration 0006.
- F5 → cron tick más fino o split por horario. Vercel Hobby limita; usar
  GitHub Actions schedule más agresivo (cada 5 min, ya hecho).
- F6 → tabla `audit_log` con FK a campañas + usuarios.

---

## No incluido (decisión consciente)

- **Builder visual drag-and-drop tipo Mailchimp** — over-engineering para
  el volumen actual. Markdown + variables alcanza.
- **Editor de plantillas HTML** — Resend acepta markdown / HTML simple; un
  editor rico (TinyMCE/Lexical) es trabajo que no agrega valor en F1-F8.
- **Integraciones tipo Zapier** — fuera del scope de investigación social.
