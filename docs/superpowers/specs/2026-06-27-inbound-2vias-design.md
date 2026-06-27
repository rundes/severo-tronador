# Cerrar bucle de 2 vías — WhatsApp · SMS · Telegram

> **Fecha:** 2026-06-27
> **Subsistema:** A — Canales entrantes (de los 3 ejes: A canales 2 vías, B performance/costo IA, C diseño funcional/reportes)
> **Estado:** diseño aprobado, pendiente de plan de implementación

## Contexto y problema

PLAN.md afirma que WhatsApp (F4) y Telegram están "en producción" con
"recepción de respuestas". El código dice otra cosa:

| Canal | Envío | Recepción real | Estado |
|---|---|---|---|
| Email (`resend`) | ✅ | ✅ inbox + reply routing (`inbound_emails`) | Completo (2 vías) |
| Telegram (`telegram-bot`) | ✅ + opt-in/out | ⚠️ free-text **se loguea, no se guarda** (`webhooks/telegram/route.ts:96-109`, "Simplificación MVP") | Casi completo |
| WhatsApp (`meta-wa-cloud`) | ✅ texto+template | ❌ webhook solo lee `statuses[]`, **nunca parsea `messages[]`** (`webhooks/meta/route.ts:66-73`) | Una vía + status |
| SMS (`telnyx-sms`) | ✅ | ❌ webhook solo mapea entrega (`webhooks/telnyx/route.ts:55-62`) | Una vía + status |

El gap real no es "integrar canales" (todos tienen envío real) sino **cerrar
el bucle de respuesta**: ingerir el mensaje entrante, asociarlo al contacto y a
la pregunta correcta, y persistirlo como respuesta cualitativa.

**Voz/IVR queda fuera** de este spec: es un stub (descarta el script TTS,
`telnyx-voice.ts:91`) y es pago — rompe la restricción "sin aumentar costo".

## Objetivo

Que una respuesta entrante de WhatsApp / SMS / Telegram se persista, se asocie
al contacto y (cuando corresponda) a la encuesta activa, y alimente
automáticamente Respuestas / cierre de campaña / ficha de relación — **a costo
$0 incremental** (todo Supabase + free-tier de los canales).

### Decisiones de alcance (tomadas en brainstorming)
- Canales: **WhatsApp + SMS + Telegram** (sin Voz).
- Profundidad: **captura simple ahora** (1 respuesta por reply), arquitectura
  lista para conversacional multi-paso después.
- Superficie: **dato ahora** (alimenta análisis existente); tabla de ingesta
  lista para una **bandeja unificada** después.
- Enfoque arquitectónico: **columna de ingesta dedicada** (resolver único +
  tabla cruda), no escritura directa a `respuestas` ni handlers por canal.

## Arquitectura

Punto de entrada lógico único: **`ingestInbound(...)`** en `lib/inbound.ts`.
Cada webhook se vuelve fino: valida firma (ya lo hace) → parsea el mensaje
entrante → llama al resolver. El resolver es la **única** pieza con lógica de
asociación / opt-out / persistencia, y se testea en aislamiento.

```
webhook (meta | telnyx | telegram)
  └─ ingestInbound({ channel, senderExternalId, toExternalId, body,
                     providerMessageId, raw, projectHint? })
        ├─ 1. resolver PROYECTO  (nº/bot receptor → conector_config;
        │                          Telegram ya trae project_id)
        ├─ 2. resolver CONTACTO  (telefono→dni normalizado | chat_id→dni)
        ├─ 3. detectar OPT-OUT   (keyword → optOut(project, dni))
        ├─ 4. resolver CONTEXTO  (último envío a dni+canal en ventana → token)
        ├─ 5. PERSISTIR cruda    → inbound_messages (SIEMPRE, matchee o no)
        └─ 6. DERIVAR respuesta  → addResponse(token, [...]) si hay token y no opt-out
```

### Principio de aislamiento
- `ingestInbound` no sabe de HTTP ni de formato de proveedor: recibe un shape
  normalizado y devuelve un resultado tipado (`{ stored, dni, optOut, responseToken }`).
- Cada webhook solo sabe parsear su propio payload → produce ese shape.
- Reusa, sin reescribir: `addResponse` (`lib/survey.ts`), `optOut` (`lib/optout.ts`),
  `telegram_chats` (`lib/telegram-chats.ts`).

## Modelo de datos — tabla `inbound_messages`

Migración nueva (`supabase/migrations/0049_inbound_messages.sql`). Zona de
aterrizaje cruda + espina para bandeja/conversacional futuros.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK default gen_random_uuid() | |
| `project_id` | uuid null | resuelto; null = huérfano sin proyecto |
| `channel` | text not null | `whatsapp` \| `sms` \| `telegram` |
| `sender_external_id` | text not null | teléfono E.164 o chat_id |
| `dni` | text null | contacto resuelto; null = remitente desconocido |
| `body` | text not null | texto entrante (trim) |
| `provider_message_id` | text null | id del proveedor (idempotencia) |
| `envio_id` | text null | envío saliente asociado, si lo hubo |
| `campaign_id` | text null | campaña del contexto |
| `respuesta_token` | text null | token de survey al que se derivó la respuesta |
| `is_opt_out` | boolean not null default false | keyword detectada |
| `received_at` | timestamptz not null default now() | |
| `processed_at` | timestamptz null | cuándo terminó de resolverse |
| `raw` | jsonb null | payload original (debug/replay) |

Constraints / índices:
- `UNIQUE(channel, provider_message_id)` (parcial `WHERE provider_message_id IS NOT NULL`)
  → idempotencia ante reintentos del proveedor.
- Índice `(project_id, dni, received_at DESC)` para la bandeja futura.
- RLS deny-all (acceso por cliente service-role, igual que el resto del modelo).
- **Sin mirror a Sheets** en este spec (las respuestas derivadas ya se espejan
  vía `respuestas`).

## El resolver — `lib/inbound.ts`

### Identidad — contacto
- **Teléfono (WhatsApp/SMS):** `normalizePhone(raw)` — strip de no-dígitos,
  fuerza prefijo país AR (`54`) si falta, devuelve E.164 sin `+` para comparar.
  `findContactByPhone(projectId, phone)` compara contra `padron.telefono`
  normalizado. Formato de `padron.telefono` es E.164-ish (`isValidPhone`,
  `PHONE_RE = /^\+?[1-9]\d{7,14}$/` en `lib/schemas.ts:179`), pero puede variar
  → la comparación normaliza ambos lados.
- **Telegram:** reusa el lookup inverso por `chat_id` ya existente
  (`telegram_chats`, devuelve `{dni, project_id}`).

### Identidad — proyecto (multi-tenant)
El nº/bot receptor pertenece al proyecto que configuró ese conector.
- Telegram: `project_id` viene de `telegram_chats` — resuelto.
- WhatsApp/SMS: lookup del receptor (`phone_number_id` de Meta / nº `to` de
  Telnyx) en `conector_config` → proyecto dueño.
- **MVP:** si hay un solo proyecto operativo, fallback a `DEFAULT_PROJECT_ID`.
  El lookup por receptor queda implementado pero el fallback cubre el caso
  mono-proyecto sin fricción.

### Contexto — a qué pregunta responde
`findLastOutbound(projectId, dni, channel, windowHours = 72)` sobre `envios`:
- toma el envío más reciente a ese `dni` en ese `channel` dentro de la ventana,
- de ahí el `campaign_id`,
- busca `survey_token(campaign_id, dni)` (vía `survey_tokens`).
- Sin envío en ventana → no se adivina: se guarda crudo sin `respuesta`.

`windowHours = 72` configurable (constante exportada).

### Opt-out
- Set de keywords configurable; default: `BAJA`, `STOP`, `CANCELAR`,
  `BAJA TOTAL` (match case-insensitive, sobre `body` trim).
- Match → `optOut(projectId, dni, "<canal> <keyword>")` + `is_opt_out = true`.
- **Prioridad sobre guardar respuesta**: un opt-out no se persiste como respuesta
  cualitativa.
- Permanente y cross-canal (regla `lib/optout.ts` existente, respetada).

### Persistencia
- **Siempre** inserta `inbound_messages` (idempotente por
  `UNIQUE(channel, provider_message_id)`); un conflicto = no-op.
- Si hay `token` y no es opt-out → `addResponse(token, [{ pregunta: "(vía <canal>)",
  respuesta: body }])`. Reusa el dedupe one-per-token existente (`survey.ts:155`).
- Setea `processed_at`, `dni`, `campaign_id`, `respuesta_token` según resultado.

## Cableado de webhooks (cambios mínimos)

### WhatsApp — `app/api/webhooks/meta/route.ts`
- Hoy: itera `entry[].changes[].value.statuses[]`.
- Agregar: iterar `value.messages[]` →
  `senderExternalId = msg.from`, `body = msg.text?.body`,
  `toExternalId = value.metadata?.phone_number_id`,
  `providerMessageId = msg.id` → `ingestInbound`.
- Solo `msg.type === "text"` en este spec (media/interactive fuera de alcance).
- Statuses intactos. Firma HMAC intacta.

### SMS — `app/api/webhooks/telnyx/route.ts`
- Hoy: status-only sobre `payload.to[].status`.
- Agregar: rama `event_type === "message.received"` →
  `senderExternalId = payload.from?.phone_number`, `body = payload.text`,
  `toExternalId = payload.to?.[0]?.phone_number`, `providerMessageId = payload.id`
  → `ingestInbound`.
- Status intacto. Firma Ed25519 intacta.

### Telegram — `app/api/webhooks/telegram/route.ts`
- Reemplazar el bloque "texto libre → log" (líneas 96-109) por `ingestInbound`
  con `channel="telegram"`, `senderExternalId = String(chat_id)`,
  `body = text`, `providerMessageId = String(msg.message_id)`,
  `projectHint` = project del chat.
- `/start <token>` y `/baja` quedan **idénticos**.

## Superficie (reusar, sin UI nueva)

La respuesta derivada entra en `respuestas` con su `token` → aparece
automáticamente en:
- página **Respuestas** (`app/(dashboard)/respuestas/page.tsx`),
- **cierre de campaña** (`lib/analysis.ts` → sentiment + temas),
- **ficha de relación** (`lib/relationship.ts`, health score on-read).

Cero pantallas nuevas. La bandeja unificada futura leerá `inbound_messages`.

## Bordes y seguridad

- Firmas ya validadas en los 3 webhooks (HMAC-SHA256 / Ed25519 / secret token)
  — **no se tocan**.
- Idempotencia por `UNIQUE(channel, provider_message_id)` → reintentos del
  proveedor no duplican.
- Remitente desconocido (sin match de contacto) → crudo con `dni = null`, sin
  respuesta.
- Sin envío reciente en ventana → crudo sin respuesta (no adivina contexto).
- Opt-out permanente cross-canal respetado.
- Los webhooks siguen devolviendo `200` rápido aunque el match de negocio falle
  (evita reintentos del proveedor por errores que no son transitorios). Errores
  reales de infra (DB caída) sí propagan a 5xx.
- PII: la tabla guarda teléfono/chat_id y texto entrante; mismo régimen que
  `inbound_emails`/`padron` (RLS deny-all, service-role).

## Testing (TDD)

Unitarios de `ingestInbound` con DB en memoria:
- match por teléfono normalizado — varios formatos AR (`+54911...`, `011...`,
  `15...`, con espacios/guiones) resuelven al mismo `dni`.
- match Telegram por `chat_id`.
- opt-out por cada keyword del set → crea opt_out, no crea respuesta.
- asociación a token por último envío dentro de ventana.
- fuera de ventana → crudo sin respuesta.
- remitente desconocido → crudo huérfano (`dni = null`).
- idempotencia: mismo `provider_message_id` dos veces → una sola fila, una sola
  respuesta.

Tests de parseo por webhook: payload real de cada proveedor (Meta `messages[]`,
Telnyx `message.received`, Telegram update) → args correctos a `ingestInbound`
(con `ingestInbound` mockeado).

## Fuera de alcance (puertas para después)

- **Voz/IVR** (stub, pago).
- **Bandeja unificada multicanal** (la tabla ya la soporta).
- **Encuesta conversacional multi-paso** (estado de sesión — la tabla la soporta).
- **Auto-reply** saliente.
- **Templates WhatsApp pre-aprobados** (envío fuera de ventana 24h).
- Media/interactive entrantes (solo `text` por ahora).

## Archivos afectados (estimación)

- **Nuevo:** `lib/inbound.ts` (resolver), `supabase/migrations/0049_inbound_messages.sql`,
  `lib/inbound.test.ts`.
- **Modificado:** `app/api/webhooks/meta/route.ts`, `app/api/webhooks/telnyx/route.ts`,
  `app/api/webhooks/telegram/route.ts`.
- **Posible helper nuevo:** `normalizePhone` / `findContactByPhone` (en `lib/inbound.ts`
  o `lib/padron`/`lib/schemas` según dónde encaje mejor).
- **Doc:** corregir PLAN.md F4 (la "recepción de respuestas" pasa de afirmación
  falsa a real al cerrar este spec).
