# Plan 03 — Analytics agregado + editor rich + canales nuevos

> Estado: Plan 02 cerrado en v1.0.0 (segments builder con AND/OR/NOT,
> drip flows con condiciones + send-window, audit log inmutable, escucha
> v2 con map picker SVG + sentiment + ranking + feed). Producto envía
> multicanal con cola async, persiste en Supabase, observa con logger
> estructurado.
>
> Lo que sigue es **profundidad de uso**: convertir los datos que ya
> capturamos en lectura accionable (analytics), mejorar la calidad del
> contenido que se manda (editor rich), reemplazar componentes-stub por
> los reales (Leaflet), y sumar canales complementarios donde el costo
> marginal es cero (Telegram).
>
> Fuente: VISION + experiencia de uso post v1.0.0.

## Filosofía

- **No agregar features hasta agotar los datos existentes**. Tenemos
  envios, respuestas, audit_log, listening_items. La primera capa de
  valor es leerlos bien antes de sumar más.
- **Cada feature nueva entra solo si responde a una pregunta operativa
  concreta**. "Quiero comparar dos campañas" → A/B real. "Quiero saber
  qué campaña costó más" → reporte agregado. Sin pregunta, no.
- **Componentes-stub se reemplazan cuando ya hay tráfico que justifique
  el costo del componente real**. Hoy Leaflet vale la pena porque el
  SVG no permite hacer pin en cualquier país.

---

## Fase 1 — Dashboard analytics agregado (`/dashboard`)

Hoy el único agregado vive en `/conectores` (cuotas por conector) y en
las páginas individuales de cada campaña/flow. Falta un overview que
permita comparar y descubrir patrones.

### 1.1 Vista mensual + KPIs

`/dashboard` con periodicidad seleccionable (últimos 7d / 30d / 90d).
KPIs:

- Total envíos por canal (sent, failed, skipped por motivo)
- Tasa de respuesta global y por canal
- Tasa de opt-out por campaña
- Costo total estimado USD (sumando `segments-cost.ts` por campaña real)
- Top temas detectados en escucha (de la ventana seleccionada)

### 1.2 Comparativa campañas

Tabla ordenable de las últimas N campañas:

| Campaña | Canal | Enviados | Respondieron | Resp % | Opt-out % | Costo |
|---|---|---|---|---|---|---|

Click en una campaña → drill-down a su página detalle.

### 1.3 Time-series

Línea de envíos/día y respuestas/día sobre la ventana seleccionada.
Detecta caídas (provider down) o picos sospechosos (campaña no
planificada).

### 1.4 Health score promedio del padrón

Distribución de healthScore agregado del padrón cargado, con bands
(green/yellow/red) graficadas. Si la base se está deteriorando (más
yellow/red mes a mes), warning visible.

---

## Fase 2 — Editor rich de plantillas (`/templates`)

Hoy plantilla = textarea de cuerpo + asunto. El autor no ve cómo se va
a renderizar hasta crear una campaña de prueba.

### 2.1 Preview lado a lado

Editor texto a la izquierda, preview interpolado a la derecha contra un
contacto de muestra del padrón (random). Live update mientras se edita.

### 2.2 Autocomplete de variables

Al tipear `{{` aparece dropdown con `SUPPORTED_VARS` ya extraído en
Plan 02 F4. Tecla Enter inserta `{{var}}`. Categorías:
- Datos del contacto (nombre, apellido, barrio, ...)
- Derivadas (saludo, fecha_humana, firma, ...)
- Acciones (encuesta_url, opt_out_url, ...)

### 2.3 Validación visual

Marcador rojo al lado de variables que NO existen en `SUPPORTED_VARS` o
en `Contact`. Cero tolerancia: una variable rota = una carta rota.

### 2.4 Diff cuando se edita una plantilla activa

Si una plantilla está siendo usada por una flow `running`, mostrar al
guardar: "Esta plantilla está en uso en N campañas/flows. Los próximos
envíos usarán la nueva versión".

### 2.5 Versionado

Tabla `template_versions(template_id, version, cuerpo, asunto,
created_at, created_by)`. Cada save crea una nueva fila. Permite
rollback. Las campañas guardan el `template_version_id` que mandaron
(en vez de solo `template_id`), para reproducibilidad.

---

## Fase 3 — Mapa real con Leaflet (`/escucha`)

El picker actual es SVG estático con bounding box AR. No permite zoom,
pan, ni países distintos.

### 3.1 react-leaflet + OSM tiles

Reemplazar `<svg>` por `<MapContainer>` con tiles de OpenStreetMap
(gratis, sin API key). Marker draggeable que setea lat/lng.

### 3.2 Buscador de lugares (Nominatim)

Input "Buscar zona…" que llama a OSM Nominatim (gratis, rate-limit
1req/s, attribution requerida). Selección reposiciona el marker.

### 3.3 Radio visual

Círculo Leaflet `Circle` del radio en km, semi-transparente. Editar
radio actualiza el círculo en tiempo real.

### 3.4 Bonus: heatmap de menciones

Si los ListenItems tuvieran lat/lng (GDELT a veces incluye), pintar
heatmap con `leaflet.heat`. Para X API no aplica (sin geo en plan free).

---

## Fase 4 — Telegram bot connector

Telegram Bot API es gratis e ilimitada. Útil como canal complementario
cuando el contacto no responde por WhatsApp pero tiene Telegram.

### 4.1 Modelo

- `telegram-bot` connector implementa `OutreachConnector`.
- Auth: `TELEGRAM_BOT_TOKEN` env.
- Para enviar a un contacto, necesitamos su `chat_id` (no su número de
  teléfono — Telegram no permite mensajear por phone).
- Solución: el primer contacto NO se inicia por nosotros. El contacto
  abre un link `t.me/<bot>?start=<token>` (incluido en otra plantilla,
  ej email) y el bot guarda su `chat_id` ↔ `dni` mapping.
- Tabla `telegram_chats(dni, chat_id, opted_in_at)`.

### 4.2 Webhook + comandos

`POST /api/webhooks/telegram` con verify secret. Comandos:
- `/start <token>` — vincula `chat_id` ↔ `dni` resolviendo el token via
  `survey_tokens`.
- `/baja` — agrega a opt_outs.
- Mensaje libre — guardar en `respuestas`.

### 4.3 Send

Solo posible si el contacto está en `telegram_chats`. Plantilla similar
a WhatsApp (texto + variables).

### 4.4 UI

- Conector aparece en `/conectores` igual que los otros.
- Campañas Telegram listan solo contactos con `chat_id` en la base.

---

## Fase 5 — A/B testing real

Hoy una campaña tiene UNA plantilla. Para optimizar mensaje se
necesitan 2+ variantes con split.

### 5.1 Modelo

- `campanas` suma `variants jsonb[]` con `{template_id, weight}`.
- `envios.variant_id` indica qué variante recibió cada contacto.

### 5.2 Asignación

Al encolar, partir audiencia según pesos. Reproducible: hash(`dni`,
`campaign_id`) → variant. Mismo dni siempre cae en la misma variante si
re-corremos la campaña.

### 5.3 Métricas comparativas

En la página de la campaña, mostrar por variante:
- Open rate (email)
- Response rate
- Opt-out rate
- Significance test simple (chi-cuadrado dos colas)

### 5.4 Auto-promote del ganador

Toggle "Si después de X envíos hay ganador estadísticamente
significativo, mandá el resto solo con esa variante". Defecto off para
no jugarse con audiencias chicas.

---

## Fase 6 — Reports exportables

Hoy los datos están en la app. Para compartir con stakeholders externos
hay que rebuildear el PDF a mano.

### 6.1 PDF de campaña

Botón "Exportar PDF" en `/campanas/[id]`. Sirve un PDF con:
- Resumen ejecutivo (1 página): KPIs principales
- Audiencia: tamaño, distribución demo, mapa de respuestas
- Mensaje enviado (plantilla interpolada de muestra)
- Resultados: tabla de respuestas tabuladas
- Costo y cuota usada
- Coding cualitativo de respuestas abiertas (si hay)

Server-side: HTML → Puppeteer/Playwright headless → PDF. O biblioteca
React-PDF si queremos render directo.

### 6.2 CSV bulk

`/dashboard/export?periodo=30d` que devuelve un zip con:
- `envios.csv`
- `respuestas.csv`
- `campanas.csv`
- `audit_log.csv`

Útil para auditoría externa (AAIP) o para mover datos a otro sistema.

### 6.3 Tablero embedable

URL pública firmada `/share/<token>` con vista read-only de un
dashboard, sin requerir login. Sirve para mostrar resultados a un
cliente sin abrir el panel completo.

---

## Orden sugerido

1. **F1.1 + F1.2 — KPIs y comparativa campañas** (alta utilidad
   inmediata; los datos ya están persistidos).
2. **F2.1 + F2.2 — Editor preview + autocomplete** (mejor producto
   diario, scope chico).
3. **F3.1 + F3.2 — Leaflet real** (reemplaza stub; SDK ya maduro).
4. **F5 — A/B testing** (el experimento más pedido en investigación
   social).
5. **F6.1 — PDF de campaña** (cierra el loop hacia el cliente externo).
6. **F4 — Telegram** (canal nuevo, requiere setup operativo del bot).
7. **F2.5 — Versionado de plantillas** (justifica solo si hay equipo
   editando).
8. **F1.3 + F1.4 + F6.2 + F6.3** según demanda.

---

## Dependencias técnicas

- F1 → vistas agregadas Postgres (materialized views o queries con
  group_by + index). Cron nocturno opcional para precomputar.
- F2 → Lexical/Tiptap/CodeMirror para el editor. Lexical encaja con
  React + accesibilidad. Tabla `template_versions` + migration.
- F3 → `react-leaflet` + `leaflet` + CSS. Dynamic import para SSR.
  Nominatim debounce 1s para no romper rate-limit.
- F4 → `node-telegram-bot-api` no, usar fetch directo a
  `api.telegram.org`. Webhook firmado con `secret_token`.
- F5 → migration en `campanas` + `envios`. Hash determinístico
  (sha1(dni+campaign_id)). Chi-cuadrado simple sin scipy.
- F6.1 → Puppeteer es 100MB; mejor `@react-pdf/renderer` o `pdfkit`.
- F6.3 → tokens firmados con `CONFIG_MASTER_KEY` (HMAC), no JWT
  pesado.

---

## No incluido (decisión consciente)

- **Multi-tenant / workspaces**: necesario para SaaS, no para single-
  tenant Centro de Estudios. Esperar señal real.
- **Voice IA conversacional (bland.ai)**: requiere KYC con provider y
  experimentación con guiones largos. Posponer hasta que telephony
  Telnyx esté operacional.
- **Editor visual de flows (canvas drag-and-drop)**: la list flat ya
  cubre el caso. Reactflow es heavy y aporta poco hasta tener flows
  con branching real.
- **Real-time collab en plantillas**: over-engineering para un equipo
  chico.
- **Integración con BigQuery/Metabase**: el CSV bulk de F6.2 cubre el
  mismo objetivo con 5% del esfuerzo.

---

## Métricas de éxito de Plan 03

- Tiempo desde "tengo idea de campaña" hasta "veo resultado claro" baja
  un 50% vs Plan 02.
- 0 campañas ejecutadas con typos de variable (`{{barreio}}`).
- Editor rich es usado en el >70% de las plantillas nuevas.
- Al menos 1 informe PDF generado por mes.
- A/B testing usado en al menos 1 de cada 3 campañas de email.
- Telegram suma al menos 5% del volumen total de envíos en 90 días.
