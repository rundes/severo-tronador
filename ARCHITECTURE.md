# Severo Tronador — Arquitectura del sistema de gestión

> ## Estado actual (corrige el detalle histórico de abajo)
>
> Este documento conserva el **modelo de conectores y los patrones de diseño**
> (vigentes), pero su detalle de *implementación/roadmap* quedó viejo. La realidad:
>
> - **Producción** sobre **Supabase (Postgres) = fuente de verdad**; Google Sheets
>   es solo **espejo** de preservación (`lib/db/mirror.ts`, `sheets_sync_queue`).
>   Donde el texto diga "Google Sheets como DB / en memoria / `cuotas`,
>   `envio_queue`, logs en Sheets", leer **Supabase**.
> - **Multi-tenant**: proyectos + membresía + roles (owner/editor/viewer),
>   `project_id` en todas las tablas (`lib/projects.ts`, `lib/workspace.ts`).
>   El §11 dice "NO multi-tenancy" — **falso hoy, sí está**.
> - **A/B testing**: implementado (`lib/ab-test.ts`). El §11 dice "NO A/B" —
>   **falso hoy**.
> - **Fases F1–F8**: todas **shipped** (no pendientes): Resend, Meta WhatsApp,
>   Telnyx SMS/voz, Telegram, Claude API, GDELT, X (API + sindicación gratis),
>   Reddit, RSS, encuestas tipadas (público + dashboard + CSV), mail.
> - **Mail** `@tronador.net.ar`: **Cloudflare Email Routing + Resend** (Stalwart
>   quedó como modo opcional, no es el primario). Ver
>   `infra/cloudflare-email-worker/`.
> - **Registry** de conectores: es un **array** `connectors: Connector[]` en
>   `lib/connectors/registry.ts` (no el objeto de imports lazy del §2.3). **No
>   existe** un conector `bland-ai` (nunca se implementó).
> - **Creds** de conectores: encriptadas en Supabase (`conector_config`,
>   `lib/crypto.ts` AES-GCM), nunca van a Sheets.
> - Stack real: **Next.js 16**, React 19, NextAuth v5, Tailwind 4.
> - Módulos en el panel hoy: Dashboard, Contactos, Escucha, Segmentos, Campañas,
>   Flows, **Encuestas**, **Mail**, Plantillas, Conectores, Proyecto, Auditoría.

> Plataforma de contactación con propósito investigativo y de fidelización.
> Modelo de **conectores activables/desactivables** (como los connectors de Claude), interfaz minimalista, y orquestación centrada en **no quemar la base de contactos ni los free tier de los proveedores**.

---

## 1. Principios de diseño

Cuatro reglas que guían toda decisión técnica y de UX.

### 1.1 Conectores, no integraciones hardcoded
Cada servicio externo (Resend, Meta Cloud, Telnyx, GDELT, Claude API, Google Sheets, …) es un **conector** que se instala, configura, activa y desactiva desde la misma pantalla, con la misma interfaz. La app no sabe nada de "email" o "whatsapp" en abstracto: sabe consumir conectores que implementan ciertas *capabilities*. Agregar un proveedor nuevo = escribir un módulo que implementa la interfaz `Connector` y registrarlo.

### 1.2 Calidad sobre cantidad — la herramienta nunca sugiere lo contrario
La UI debe hacer que **mandar a 80 personas correctas se sienta mejor que mandar a 8.000 random**. Cada pantalla muestra el tamaño del segmento, qué tan reciente fue el último contacto, y qué tan saludable está la relación con cada destinatario. Mandar masivo y genérico es técnicamente posible pero requiere pasos extra y advertencias — el camino fácil es el camino correcto.

### 1.3 Las cuotas son ciudadanos de primera clase
En todo momento, en cada pantalla relevante, se ve cuántos envíos quedan en el free tier del mes por canal. La cola de envío chequea cuota **antes** de cada envío, no después. Un segmento que excede la cuota disponible es **bloqueado para ejecución**, no avisado con un warning ignorable. El usuario decide: recortar segmento, esperar al reset mensual, o (último recurso) habilitar tier pago.

### 1.4 La unidad atómica es el contacto, no la campaña
Cada persona del padrón tiene una **ficha de relación**: cuándo se la contactó, por qué canal, si respondió, qué dijo, cuál es su canal preferido, cuándo vuelve a estar disponible para contactar. La campaña es una *vista* sobre esos contactos — los contactos son el dato persistente, las campañas son efímeras.

---

## 2. Modelo de conector

### 2.1 Interfaz

```ts
// lib/connectors/types.ts
export type ConnectorCategory =
  | 'data'       // fuente de contactos (Google Sheets)
  | 'outreach'   // canal saliente (Email, WhatsApp, SMS, Voice, Telegram)
  | 'listening'  // canal entrante (GDELT, X API, Reddit, Atribus...)
  | 'analysis'   // procesamiento (Claude API, embeddings)
  | 'auth';      // auth (Google OAuth)

export type ConnectorStatus =
  | 'not_installed'    // no agregado al sistema
  | 'configuring'      // agregado, faltan credenciales o test
  | 'enabled'          // listo y activo
  | 'paused'           // credenciales OK pero toggle off
  | 'error'            // creds expiradas / API caída
  | 'quota_exhausted'; // free tier mensual agotado

export interface Quota {
  used: number;
  limit: number;
  unit: 'messages' | 'conversations' | 'minutes' | 'tokens' | 'api_calls';
  period: 'day' | 'month' | 'rolling-30d';
  resetAt: Date | null; // null = no reset (créditos consumibles)
}

export interface Capability {
  id: string;               // 'email.send', 'whatsapp.send_template', 'voice.outbound_call'
  label: string;            // 'Enviar email transaccional'
  costPerUnit?: number;     // USD (para tier pago) o 0 (free tier)
  rateLimit?: { perSecond?: number; perMinute?: number };
}

export interface Connector {
  id: string;                       // 'resend', 'meta-wa-cloud', 'telnyx-sms'
  name: string;                     // 'Resend'
  vendor: string;                   // 'Resend, Inc.'
  category: ConnectorCategory;
  iconUrl: string;
  description: string;              // una línea
  docsUrl: string;

  capabilities: Capability[];
  configSchema: ConfigSchema;       // qué pide para conectarse

  // lifecycle
  test(config: Config): Promise<TestResult>;
  status: ConnectorStatus;
  quota?: Quota;                    // si el provider lo expone o lo estimamos
  lastSyncedAt?: Date;
}
```

Cada categoría refina la interfaz con sus métodos específicos:

```ts
export interface OutreachConnector extends Connector {
  send(message: OutreachMessage, recipient: Contact): Promise<SendResult>;
  estimateQuotaImpact(count: number): { willFit: boolean; remaining: number };
}

export interface ListeningConnector extends Connector {
  fetch(query: ListenQuery): Promise<ListenItem[]>;
}

export interface AnalysisConnector extends Connector {
  analyze(input: string | string[], task: AnalysisTask): Promise<AnalysisResult>;
}
```

### 2.2 Lifecycle (máquina de estados)

```
                  [add connector]
   not_installed ──────────────────►  configuring
                                            │
                              [save + test passes]
                                            ▼
                       ┌──────────────►  enabled  ◄─────┐
              [toggle on]                    │          │
                       │              [toggle off]      │
                       │                    ▼           │
                       │                 paused         │
                       │                    │           │
                       │              [toggle on]       │
                       │                    │           │
                       └────────────────────┘           │
                                                        │
                       enabled                          │
                          │                             │
                          │  [API call falla         [creds      
                          │   con 401/403]           refresh OK]
                          ▼                             │
                       error  ──────────────────────────┘
                          │
                          │  [quota mensual = 0]
                          ▼
                  quota_exhausted
                          │
                          │  [reset mensual / upgrade tier]
                          ▼
                       enabled
```

### 2.3 Registry y discovery

```ts
// lib/connectors/registry.ts
export const connectorRegistry = {
  // outreach
  'resend': () => import('./resend'),
  'meta-wa-cloud': () => import('./meta-wa-cloud'),
  'telnyx-sms': () => import('./telnyx-sms'),
  'telnyx-voice': () => import('./telnyx-voice'),   // IVR de menú simple
  'bland-ai': () => import('./bland-ai'),           // encuesta telefónica conversacional IA
  'telegram-bot': () => import('./telegram-bot'),

  // listening
  'gdelt': () => import('./gdelt'),
  'x-api': () => import('./x-api'),
  'reddit-api': () => import('./reddit-api'),

  // analysis
  'claude-api': () => import('./claude-api'),

  // data + auth
  'google-sheets': () => import('./google-sheets'),
  'google-oauth': () => import('./google-oauth'),
} as const;
```

Agregar Brandwatch, Atribus, Brand24 o Listmonk en el futuro = un archivo nuevo + una línea acá. Cero cambios en UI o lógica de negocio.

---

## 3. Catálogo de conectores propuesto

| Conector | Categoría | Free tier (mes) | Capabilities clave |
|---|---|---|---|
| **Google Sheets** ⭐ | data | gratis (sin límite práctico) | `padron.read`, `data.read_write` |
| **Google OAuth** | auth | gratis | `auth.login` |
| **Resend** | outreach | 3.000 emails | `email.send`, `email.track_open`, `email.track_click` |
| **Meta Cloud API (WhatsApp)** | outreach | 1.000 conversaciones service-initiated | `wa.send_template`, `wa.send_freeform_in_24h_window` |
| **Telnyx SMS** | outreach | $2 trial luego pago | `sms.send`, `sms.receive` |
| **Telnyx Voice / IVR** | outreach | $2 trial luego pago | `voice.outbound_call`, `voice.ivr_flow` |
| **Bland AI** (voz IA) | outreach | pago (~$0.13/min bundled) | `voice.conversational_survey` (entrevista con repregunta) |
| **Telegram Bot** | outreach | ilimitado | `tg.send_message`, `tg.broadcast_channel` |
| **Claude API** | analysis | depende del tier | `analysis.sentiment`, `analysis.coding_qualitative`, `analysis.cluster_responses` |
| **GDELT** | listening | gratis (BigQuery quota) | `news.fetch_geo`, `news.fetch_topic` |
| **X API Basic** | listening | 1.500 tweets/mes | `tweets.search`, `tweets.geo_filter` |
| **Reddit API** | listening | gratis | `reddit.search_subreddit`, `reddit.search_keyword` |

### Conectores opcionales a sumar después

- **Brevo / Listmonk / AWS SES** (cuando Resend free se quede chico)
- **360dialog** (alternativa WhatsApp a escala)
- **Vapi / Retell / ElevenLabs Conv AI** (alternativas a Bland AI para voz IA conversacional — ver [PROVIDERS.md](./PROVIDERS.md))
- **Atribus, Brand24, Awario** (social listening regional/SMB)
- **Brandwatch** (enterprise, sólo si presupuesto institucional)

---

## 4. Sistema de gestión de cuotas

### 4.1 Tracking de cuota residual

Una tabla en Google Sheets (`cuotas`) trackea el estado actual de cada conector:

| connector_id | quota_unit | used_this_period | limit_this_period | period_resets_at | last_updated |
|---|---|---|---|---|---|
| resend | emails | 1.247 | 3.000 | 2026-06-01 | 2026-05-26T14:32:00Z |
| meta-wa-cloud | conversations | 312 | 1.000 | 2026-06-01 | 2026-05-26T14:30:00Z |
| x-api | tweets | 980 | 1.500 | 2026-06-01 | 2026-05-26T14:00:00Z |

Cada envío exitoso incrementa `used_this_period`. Conectores que exponen quota vía API (Meta, X API) se sincronizan cada hora; los demás se estiman localmente.

### 4.2 Quota-aware queue

El cron job que procesa la cola de envíos hace **3 chequeos antes de cada batch**:

```ts
async function processBatch(connector: OutreachConnector, batch: PendingMessage[]) {
  // 1. ¿Hay cuota suficiente?
  const { willFit, remaining } = connector.estimateQuotaImpact(batch.length);
  if (!willFit) {
    return { paused: true, reason: 'quota_exhausted', would_need: batch.length, available: remaining };
  }

  // 2. ¿Respetamos el rate limit del provider?
  const allowedNow = await rateLimiter.tokensAvailable(connector.id);
  const effectiveBatch = batch.slice(0, allowedNow);

  // 3. ¿Algún destinatario está en cooldown o opt-out?
  const filtered = await filterByContactState(effectiveBatch);

  // Enviar el batch filtrado
  for (const msg of filtered) {
    await connector.send(msg.payload, msg.contact);
    await quotaTracker.increment(connector.id, 1);
  }
}
```

### 4.3 UX de cuotas

En la barra superior de la app, siempre visible:

```
┌────────────────────────────────────────────────────────────────┐
│ severo·tronador                              🔋 Cuotas del mes  │
│                                                                 │
│                     📧 1.753/3.000  💬 688/1.000  📱 — (pago)  │
└────────────────────────────────────────────────────────────────┘
```

Al crear una campaña, si el segmento excede la cuota:

```
┌─────────────────────────────────────────────────────────────┐
│  Esta campaña no entra en tu cuota                          │
│                                                              │
│  Segmento:          2.450 personas                          │
│  Canal:             📧 Email (Resend)                       │
│  Disponibles:       1.247 envíos antes del reset (1 jun)    │
│                                                              │
│  Opciones:                                                   │
│  • Recortar segmento a 1.247                                │
│  • Programar 1.247 ahora + 1.203 después del 1 jun          │
│  • Cancelar                                                  │
│                                                              │
│  [Recortar]  [Programar en partes]  [Cancelar]              │
└─────────────────────────────────────────────────────────────┘
```

No hay opción "ignorar la cuota y mandar igual" — el sistema literalmente no puede hacerlo sin upgrade del conector.

---

## 5. Modelo de fidelización

### 5.1 Ficha de relación por contacto

Cada DNI del padrón tiene **estado mantenido en el tiempo**:

```ts
interface ContactRelationship {
  dni: string;

  // Historial agregado
  totalContactsMade: number;
  totalResponses: number;
  responseRate: number;          // 0..1

  // Por canal
  channels: {
    email?:    { available: boolean; lastContactedAt?: Date; lastRespondedAt?: Date; }
    whatsapp?: { available: boolean; lastContactedAt?: Date; lastRespondedAt?: Date; }
    sms?:      { available: boolean; lastContactedAt?: Date; lastRespondedAt?: Date; }
    voice?:    { available: boolean; lastContactedAt?: Date; lastRespondedAt?: Date; }
  };

  preferredChannel: 'email' | 'whatsapp' | 'sms' | 'voice' | null;  // inferido

  // Estado actual
  healthScore: number;           // 0..100 — ver §5.3
  nextAvailableAt: Date;         // cooldown global
  status: 'available' | 'cooling_down' | 'opted_out' | 'bounced' | 'unresponsive';

  // Opt-out granular (puede estar dado de baja en un canal pero no en otro)
  optOuts: Array<{ channel: string; at: Date; reason?: string }>;
}
```

### 5.2 Cooldowns por defecto

Valores configurables, defaults conservadores:

| Canal | Cooldown mínimo entre contactos | Notas |
|---|---|---|
| Email | 14 días | Más alto si el último no se abrió |
| WhatsApp | 30 días | WA es invasivo, hay que cuidarlo más |
| SMS | 30 días | Idem, además es caro |
| Voz | 60 días | Más invasivo todavía |

Si una persona respondió al último contacto, el cooldown se reduce a la mitad — premio a la engagement.

### 5.3 Health score

Algoritmo simple, transparente:

```
healthScore = 100
  - 20 × consecutiveUnanswered
  + 30 × hasEverResponded
  - 50 × hasComplained
  - 10 × daysSinceLastContact / 365   // relaciones se atrofian
  + 20 × respondedInLast90Days
```

Se calcula on-read, no se persiste (siempre fresco).

Tres bandas:
- **🟢 80–100**: relación sana, contacto recomendado
- **🟡 40–79**: relación tibia, contactar con mensaje de alto valor
- **🔴 0–39**: relación deteriorada, considerar pausa larga o sacar del segmento

### 5.4 Channel preference learning

Después de 3 contactos a una persona, el sistema infiere su canal preferido como **el canal con mayor `respondedAt / contactedAt` ratio**. Si tiene preferencia clara, futuras campañas que la incluyan **proponen ese canal por default**, aunque la campaña sea multi-canal.

### 5.5 Reglas duras (no negociables)

- **Opt-out** en cualquier canal es respetado para SIEMPRE en ese canal. No expira.
- **Opt-out global** (respondió "BAJA" o desuscribió) saca a la persona de TODOS los canales por defecto, salvo override explícito con justificación logueada.
- **Bounce permanente** (email rebota duro, teléfono inválido) marca el canal como `unavailable` para esa persona.
- **Cooldown** no se puede saltear desde la UI. Solo se puede acortar editando configuración global, y queda en logs.

---

## 5b. Análisis cualitativo asistido por LLM (conector `claude-api`)

Las encuestas con preguntas abiertas ("¿qué cambiarías del barrio?") generan texto libre cuyo análisis tradicional exige *coders* humanos haciendo coding inductivo y deductivo. El conector `claude-api` (categoría `analysis`) reduce ese trabajo en órdenes de magnitud sin sacar al humano del loop.

### 5b.1 Pipeline

```
1. Pre-procesamiento     Limpieza + anonimización (remover nombres y direcciones).
        │
2. Coding inductivo      1er pass de Claude sobre ~10% de respuestas →
        │                códigos emergentes (descubrimiento de temas).
3. Validación humana     El investigador revisa y consolida la lista de códigos.
        │
4. Coding deductivo      2do pass de Claude sobre el 100% → asigna códigos validados.
        │
5. Embeddings+clustering Detecta respuestas atípicas o sub-temas no contemplados.
        │
6. Dashboard             Frecuencia por código × filtros del padrón (edad, barrio, sexo).
```

La capability se expone como `analysis.coding_qualitative` (+ `analysis.sentiment`, `analysis.cluster_responses`), consumida por el dashboard de cierre de campaña (§7, paso 7).

### 5b.2 Consideraciones

| Tema | Decisión |
|---|---|
| **Privacidad** | Las respuestas van a la API de un tercero (Anthropic). Para datos sensibles, evaluar Claude vía Bedrock o un modelo open-source on-device. Anonimizar **antes** del paso 2. |
| **Bias / consistencia** | Prompts estandarizados y versionados. Auditoría humana sobre ~5% de la salida para detectar alucinación de códigos. |
| **Costo** | Claude Haiku ≈ $1/M tokens input → procesar 10.000 respuestas de ~200 palabras ≈ **$2**. El conector trackea gasto como cuota en unidad `tokens`. |

Activado en **F7** (ver [PLAN.md](./PLAN.md)). Es el primer conector `analysis` del catálogo y el patrón para futuros (embeddings, traducción, etc.).

---

## 6. UI / UX — minimalismo estilo Claude

### 6.1 Layout general

```
┌──────────┬──────────────────────────────────────────────────────┐
│          │  severo·tronador            🔋 1.753/3.000 · 688/1k   │
│   ●●●    │                                                       │
│          │                                                       │
│  ▸ Hoy   │                                                       │
│  ▸ Cam-  │           [ contenido principal aquí ]                │
│    pañas │                                                       │
│  ▸ Seg-  │                                                       │
│    mentos│                                                       │
│  ▸ Con-  │                                                       │
│    tactos│                                                       │
│  ▸ Res-  │                                                       │
│    puestas│                                                      │
│          │                                                       │
│  ───     │                                                       │
│  ⚙ Conec-│                                                       │
│    tores │                                                       │
│  ⚙ Ajustes│                                                      │
└──────────┴──────────────────────────────────────────────────────┘
```

Sidebar fina (~240 px), monoespaciado para los items, sin íconos pesados — un punto o un ▸ alcanza. Canvas principal con padding generoso (≥48 px laterales) y un solo CTA visible por pantalla.

### 6.2 Panel de conectores

Espejo directo de la pantalla "Settings → Connectors" de Claude:

```
┌──────────────────────────────────────────────────────────────────┐
│  Conectores                                                       │
│  ─────────                                                        │
│                                                                   │
│  Datos                                                            │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Google Sheets                              [activo]    ●—— │ │
│  │  Padrón enriquecido · 198.432 filas · sync hace 4 min       │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Canales de contactación                                          │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Resend (Email)                    1.753/3.000 mes  ●——     │ │
│  │  Conectado · dominio: encuestas.maipu.gob.ar                │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Meta Cloud API (WhatsApp)          688/1.000 mes  ●——      │ │
│  │  Conectado · 3 templates aprobados                          │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Telnyx SMS                                  ——●  inactivo  │ │
│  │  No configurado · agregar API key                           │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Escucha y análisis                                               │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  GDELT                                       ●—— activo     │ │
│  │  Geo: tu territorio · 47 artículos esta semana              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Claude API (análisis cualitativo)           ●—— activo     │ │
│  │  Tier paid · usado este mes: $4.32                          │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  + Agregar conector                                         │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

Click sobre un conector → modal de configuración con: descripción, link a docs, campos de credenciales, botón "Probar conexión", historial de uso. Cero scroll vertical en el panel principal — todo cabe.

### 6.3 Vista de contacto individual (la ficha de relación)

```
┌──────────────────────────────────────────────────────────────────┐
│  ←  Volver a segmento "30-50 años, Barrio Norte"                        │
│                                                                   │
│  María Elena Rodríguez                                            │
│  DNI 22.345.678 · 47 años · Bo. Barrio Norte · Circuito 12          │
│                                                                   │
│  ─────────────────────                                            │
│                                                                   │
│  Salud de la relación             🟢 84/100                       │
│  Próximo contacto permitido       hoy mismo (cualquier canal)    │
│  Canal preferido inferido         WhatsApp (3/3 respondidos)     │
│                                                                   │
│  Historial                                                        │
│  · 12 mar 2026  WhatsApp · Encuesta seguridad Barrio Norte · respondió  │
│  · 04 feb 2026  Email · Invitación foro vecinal · respondió      │
│  · 18 ene 2026  WhatsApp · Sondeo transporte · respondió         │
│                                                                   │
│  ─────────────────────                                            │
│                                                                   │
│  [Contactar ahora]    [Agregar a segmento]    [Ver respuestas]   │
└──────────────────────────────────────────────────────────────────┘
```

### 6.4 Vista de segmento

```
┌──────────────────────────────────────────────────────────────────┐
│  Segmentos · "Mujeres 30-50, Barrio Norte"                          │
│                                                                   │
│  287 personas                                                     │
│                                                                   │
│  Distribución de salud                                            │
│  🟢 sanas       198  ████████████████████░░░░░░░  69%            │
│  🟡 tibias       64  ██████████░░░░░░░░░░░░░░░░░  22%            │
│  🔴 deterioradas 25  ████░░░░░░░░░░░░░░░░░░░░░░░   9%            │
│                                                                   │
│  Disponibles para contacto HOY                                    │
│  📧 Email:    243  (44 en cooldown)                              │
│  💬 WhatsApp: 198  (89 en cooldown)                              │
│  📱 SMS:      287  (todas disponibles)                           │
│                                                                   │
│  ─────────────────────                                            │
│                                                                   │
│  Filtros aplicados                                                │
│  · sexo = femenino                                                │
│  · edad ∈ [30, 50]                                                │
│  · barrio = "Barrio Norte"                                           │
│  · health_score ≥ 40                                              │
│                                                                   │
│  [Editar filtros]    [Iniciar campaña →]    [Exportar]            │
└──────────────────────────────────────────────────────────────────┘
```

### 6.5 Flujo de campaña (wizard de 3 pasos, no más)

**Paso 1 — Audiencia**
- Selector de segmento guardado, o constructor de filtros inline
- Preview en vivo de cuántos quedan tras aplicar cooldowns y opt-outs
- Distribución de health score (incentiva limpiar segmento)

**Paso 2 — Mensaje**
- Selector de canal con cuotas residuales visibles
- Template editor con variables (`{{nombre}}`, `{{barrio}}`)
- Preview por canal
- Estimación de impacto en cuota: "Mandar a 287 personas usará 287 de tus 1.247 emails restantes este mes"

**Paso 3 — Programación**
- Ahora / fecha programada
- Rate limit visible: "Se mandarán en lotes de 100/hora respetando límites de Resend"
- Confirmación final con todo el resumen

Una sola pantalla por paso, una sola decisión visible por pantalla, sin paneles laterales que distraigan.

---

## 7. Flujo end-to-end de una campaña típica

> **Caso**: "Quiero saber qué piensan mujeres de 30 a 50 años del barrio Barrio Norte sobre el transporte público."

1. **Definir segmento**
   - Crear filtros `sexo=F, edad∈[30,50], barrio="Barrio Norte", health_score≥40`
   - Sistema devuelve: 287 personas, 198 sanas, 64 tibias, 25 deterioradas
   - Aplicar cooldowns por canal → 198 disponibles WhatsApp / 243 email / 287 SMS

2. **Diseñar contacto**
   - Canal default sugerido por mayoría de preferencias: WhatsApp
   - Template: "Hola {{nombre}}, soy del equipo de relevamiento. ¿Tenés 2 min para una pregunta sobre transporte público en Barrio Norte? Tu respuesta nos ayuda a investigar, no es propaganda. Si no querés recibir más mensajes: respondé BAJA."
   - Link a encuesta tokenizada: `/encuesta/abc123`
   - Preview, validación de variables

3. **Chequeo de cuota**
   - 198 mensajes vs. 312 disponibles este mes en WhatsApp ✅
   - Sistema confirma puede ejecutarse hoy mismo

4. **Programación**
   - Ahora, rate-limited por Meta (60/min en sandbox, 250/min producción)
   - Se ejecuta en ~5 min

5. **Monitoreo en vivo**
   - Dashboard de la campaña muestra: enviados / entregados / leídos / respondidos / opt-outs en tiempo real
   - Si tasa de opt-out > 2% en los primeros 50 envíos → pausa automática + alerta

6. **Recolección de respuestas**
   - Cada respuesta llega via webhook de Meta o via formulario tokenizado
   - Se loguea contra el DNI del destinatario
   - Para respuestas abiertas: Claude API codifica inductivamente

7. **Debrief automático**
   - Tras 48h del último envío, dashboard de cierre:
     - Tasa de respuesta global y por health score
     - Top 5 temas mencionados (clustering Claude)
     - Lista de opt-outs (para revisar tono del mensaje)
     - Salud de relación post-campaña (deltas)

8. **Actualización de fidelización**
   - Cada respuesta sube el health score de quien respondió
   - Cada no-respuesta consecutiva lo baja levemente
   - Cooldown de WhatsApp empieza para los 198 contactados
   - Si alguien respondió de manera muy negativa: flag para revisión humana antes de próximo contacto

---

## 8. Updates al modelo de datos (Google Sheets)

A las 7 hojas originales del [PLAN.md](./PLAN.md), se suman 3 nuevas:

| Hoja | Rol | Columnas clave |
|---|---|---|
| `conectores` | Estado de cada conector | id, status, config_json (encriptado), enabled_at, last_test_at, last_error |
| `cuotas` | Tracking de uso vs. límite | connector_id, period, used, limit, resets_at, last_synced |
| `relacion_contactos` | Ficha de fidelización | dni, total_contacts, total_responses, last_contact_at, preferred_channel, health_score_cached, status |

La hoja `envios` ya cubre el detalle granular de cada interacción; `relacion_contactos` es la **vista agregada y rápida** para no recomputar el historial completo en cada query.

---

## 9. Cómo encaja en las fases de entrega

> El roadmap único y fuente de verdad vive en [PLAN.md → Fases de entrega](./PLAN.md#fases-de-entrega-roadmap-único). Acá solo se resume el **mapeo fase → conector** para mostrar que el modelo de plugins está presente desde el inicio.

Cada fase activa uno o más conectores del registry (§2.3) sin tocar el core:

| Fase | Conectores que activa |
|---|---|
| F1 | `google-oauth`, `google-sheets` (+ panel de conectores) |
| F2 | — (segmentos, ficha de contacto, health score) |
| F3 | `resend` (+ tracking de cuotas) |
| F4 | `meta-wa-cloud` (+ webhooks) |
| F5 | `telnyx-sms`, `telnyx-voice` |
| F6 | — (encuestas/intercambios tokenizados, opt-out cross-channel) |
| F7 | `claude-api` (+ dashboard de cierre) |
| F8 | `gdelt`, `x-api`, `reddit-api` |

F1 ya construye **la infraestructura de conectores** aunque solo tenga uno vivo (Sheets). Cada fase siguiente agrega conectores sin tocar el core.

---

## 10. Stack técnico — decisiones derivadas

| Capa | Elección | Por qué |
|---|---|---|
| Framework | Next.js 15 + App Router | Server-side seguro para credenciales, deploy simple Vercel |
| Lenguaje | TypeScript estricto | El modelo de conectores depende de tipos firmes |
| UI | Tailwind + shadcn/ui (subset) | Minimalismo, componentes accesibles, fácil de personalizar |
| Auth | NextAuth + Google OAuth + allowlist | Como las otras apps de Severo |
| Persistencia | Google Sheets API (service account) | Decisión ya tomada, encaja con el catálogo de conectores (Sheets = un conector más) |
| Queue | Vercel Cron + tabla `pendientes_envio` en Sheets | Sin infra extra; suficiente hasta 10k envíos/día |
| Encriptación de creds | `@better-auth/secrets` o equivalente, master key en env | Las API keys de conectores nunca van plain a Sheets |
| Logs | Sheets `logs` + Vercel logs nativos | Auditoría humana-legible + debug técnico |
| Tests | Vitest + MSW para mocks de APIs | Los conectores deben ser testeables sin tocar el provider real |

---

## 11. Lo que esta arquitectura NO hace (por diseño)

Para mantener el foco, dejamos fuera:

- **Editor visual de flujos conversacionales** (à la Typebot/Botpress). Las encuestas se editan en el builder (preguntas tipadas + JSON), no en un canvas conversacional.
- **CRM completo** (gestión de pipeline, tareas, recordatorios). Esto es investigación, no ventas.
- **App móvil nativa**. La web mobile-friendly es suficiente para encuestadores en campo.
- **Llamadas con operadora humana en vivo** (à la VICIdial/CallHub). Si hace falta, se usa el celular del encuestador y se loguea manualmente.

> Nota: lo que este diseño originalmente dejaba afuera y **ya se implementó**:
> **multi-tenancy** (proyectos + roles) y **A/B testing de mensajes**
> (`lib/ab-test.ts`).

---

## 12. Riesgos arquitectónicos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Conector cambia su API y rompe nuestra implementación | Alta (sucede ~1×/año por conector) | Tests de contrato corridos diariamente vía cron; aviso temprano antes de que falle en producción |
| Cuota de un conector se mide mal y mandamos de más | Media | Estimación local + sync con provider cada hora; safety margin del 5% antes del límite |
| Sheets se vuelve lento con >100k filas en `envios` | Alta a 6 meses | Archivar campañas viejas a hoja separada después de 90 días; eventualmente migrar `envios` a Postgres |
| Credenciales de conectores filtradas en client bundle | Crítica si pasa | Lint rule que prohíbe imports de `lib/connectors/*` desde código `'use client'` |
| Webhooks fallan silenciosamente (estado desactualizado) | Media | Reconciliación periódica via API pull cada 6h, alertas si divergencia > 2% |
| Usuario crea segmentos masivos y todos los conectores marcan quota_exhausted | Media | UI bloquea segmentos > 80% de cuota disponible sin confirmación explícita |

---

## 13. Próximo paso concreto

**F1 — scaffold inicial.** Cuando me des el OK arranco con:

1. `npx create-next-app severo-tronador` (en la raíz del repo actual)
2. Setup de Tailwind + shadcn/ui (instalando solo los componentes minimalistas que usamos)
3. NextAuth + Google OAuth con allowlist por email
4. Estructura `lib/connectors/` con el tipo `Connector` y el registry vacío
5. Primer conector: Google Sheets — implementado completo
6. Pantalla `/conectores` con un solo conector visible (Sheets) y el botón "+ Agregar conector" deshabilitado por ahora
7. Conexión a un Sheet placeholder de prueba con 100 filas mock

Sin credenciales reales todavía: todo corre local con un Sheet de prueba propio. Cuando me pases el del padrón real, swap de 1 línea en el config.
