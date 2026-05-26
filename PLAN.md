# Severo Tronador — Plan de implementación

> **Roadmap único y fuente de verdad de las fases.** Para el **por qué / el sentido** ver [VISION.md](./VISION.md); para el **cómo técnico** (modelo de conectores, fidelización, UI) ver [ARCHITECTURE.md](./ARCHITECTURE.md); para el **abanico de servicios** ver [PROVIDERS.md](./PROVIDERS.md).

Plataforma web que toma el padrón enriquecido de Maipú, le da segmentación fina y una estrategia multicanal asistida sobre un **abanico de conectores activables (plugins)**, y registra todo en Google Sheets como capa de datos — con propósito **investigativo / encuestas**.

## Alcance

**Sí**: relevamientos territoriales, encuestas cuali/cuanti, opinión pública, intercambios con la ciudadanía, métricas de campo.
**No**: propaganda electoral, posicionamiento de candidatos, fundraising político.

Este encuadre nos posiciona como herramienta de **investigación social** (vertical Market Research), lo que destraba prácticamente todos los providers comerciales (ver [PROVIDERS.md](./PROVIDERS.md)) y nos mantiene del lado correcto de la Ley 25.326. Es parte del sentido del producto, no un disclaimer — ver [VISION.md §6](./VISION.md).

## Arquitectura

```
┌─────────────────────────────────────────────────────┐
│  Next.js 15 (App Router) + TS + Tailwind + shadcn   │
│  ───────────────────────────────────────────────    │
│  /app                                                │
│    /segmentos     query builder + preview           │
│    /templates     editor de mensajes                 │
│    /campañas      wizard + monitor                   │
│    /respuestas    tabla con filtros                  │
│    /dashboard     métricas                           │
│    /encuesta/[token]   landing pública               │
│    /api/*         server-side (sheets + providers)   │
└─────────────────────────────────────────────────────┘
                          │
                ┌─────────┼─────────┐
                ▼         ▼         ▼
        ┌───────────┐ ┌───────┐ ┌──────────┐
        │ Google    │ │ Auth  │ │ Channel  │
        │ Sheets    │ │ Google│ │ Providers│
        │ (DB)      │ │ OAuth │ │          │
        └───────────┘ └───────┘ └──────────┘
                                     │
                  ┌──────────────────┼──────────────┐
                  ▼                  ▼              ▼
              ┌────────┐         ┌────────┐    ┌────────┐
              │ Resend │         │  Meta  │    │ Telnyx │
              │ (email)│         │  Cloud │    │ (SMS+  │
              └────────┘         │ (WA)   │    │  voz)  │
                                 └────────┘    └────────┘
```

## Capa de datos — Google Sheets (10 hojas)

Las 7 hojas operativas originales + 3 que sostienen el modelo de conectores y fidelización (ver [ARCHITECTURE.md §8](./ARCHITECTURE.md)).

| Hoja | Rol | Columnas clave |
|---|---|---|
| `padron` | Read-only, fuente | DNI, nombre, apellido, fecha_nac, sexo, domicilio, barrio, circuito, mesa, telefono, email |
| `segmentos` | Audiencias guardadas | id, nombre, filtros_json, tamaño, creado_por, creado_at |
| `templates` | Plantillas por canal | id, canal, nombre, asunto, cuerpo (vars `{{nombre}}`, `{{barrio}}`), estado |
| `campañas` | Metadata | id, nombre, canal, template_id, segmento_id, estado, scheduled_at, métricas |
| `envios` | 1 fila por destinatario × campaña | campaña_id, dni, canal, destino, estado, sent_at, delivered_at, opened_at, replied_at, error |
| `respuestas` | Respuestas a encuestas/intercambios | envio_id, pregunta, respuesta, timestamp |
| `opt_outs` | Bajas globales | identificador (dni/tel/email), canal, fecha, motivo |
| `conectores` | Estado de cada plugin | id, status, config_json (encriptado), enabled_at, last_test_at, last_error |
| `cuotas` | Tracking de free tier vs. uso | connector_id, period, used, limit, resets_at, last_synced |
| `relacion_contactos` | Ficha de fidelización (vista agregada) | dni, total_contacts, total_responses, last_contact_at, preferred_channel, health_score_cached, status |

## Stack confirmado

- **Next.js 15** (App Router) + TypeScript + Tailwind + shadcn/ui
- **NextAuth** con Google OAuth (como las otras apps de Severo) + allowlist por email
- **`googleapis` SDK** + service account (server-side, credenciales nunca en client)
- **Vercel Cron** (cada minuto) → procesa cola de envíos con rate limit por provider
- **Webhooks**: `/api/webhooks/{resend,meta,telnyx}` actualizan estados en `envios`

## Providers por fase

Ver detalle completo en [PROVIDERS.md](./PROVIDERS.md). TL;DR:

| Canal | F3 (MVP) | A escala |
|---|---|---|
| Email | **Resend** (3k free/mes) | Brevo o Listmonk + SES |
| WhatsApp | **Meta Cloud API directo** (1k service/mes free) | 360dialog |
| SMS | **Telnyx** (más barato) | Telnyx + 360nrs (factura AR) |
| Voz / IVR | **Telnyx** | Telnyx |
| Encuesta | **Built-in Next.js** | Built-in + Google Forms ad-hoc |
| Telegram (alt) | **Bot API gratis** | — |

## Fases de entrega (roadmap único)

Roadmap reconciliado alrededor del **modelo de conectores desde el inicio**: F1 construye la infraestructura de plugins aunque solo tenga uno vivo (Sheets), y cada fase siguiente **suma un conector sin tocar el core**. El abanico crece; el núcleo no se mueve.

| # | Entregable | Conectores que activa | Salida | Status |
|---|---|---|---|---|
| **F0** | Plan + research + arquitectura + visión | — | Este doc + VISION/ARCHITECTURE/PROVIDERS | ✅ Hecho |
| **F1** | Scaffold Next.js + auth Google + **panel de conectores** + conector Google Sheets (mock padrón) | `google-oauth`, `google-sheets` | App local con infra de plugins | ⏳ Siguiente |
| **F2** | Lectura del padrón + constructor de segmentos + ficha de contacto + health score básico | — | UI funcional sin envíos | |
| **F3** | Templates + creación de campañas + **envío real email** + tracking de cuotas | `resend` | E2E primer canal + cuotas vivas | |
| **F4** | WhatsApp Meta Cloud API + templates aprobados + webhooks de estado | `meta-wa-cloud` | 2 canales activos | |
| **F5** | SMS + voz/IVR + registro de llamadas | `telnyx-sms`, `telnyx-voice` | Multi-canal saliente completo | |
| **F6** | Encuestas/intercambios públicos `/encuesta/[token]` con tracking + opt-out cross-channel + dedupe | — | Captura de respuestas | |
| **F7** | Análisis cualitativo de respuestas + dashboard de cierre | `claude-api` | Coding inductivo + clustering | |
| **F8** | Listening pasivo (descubrir temas antes de encuestar) + alertas de tema emergente | `gdelt`, `x-api`, `reddit-api` | Pipeline listening → encuesta | |

> **Canal complementario** (`telegram-bot`, gratis e ilimitado) puede sumarse en cualquier punto a partir de F4 — es un archivo más en el registry.

## Estructura de carpetas (target post F1)

```
severo-tronador/
├── app/
│   ├── (auth)/               # NextAuth pages
│   ├── (dashboard)/          # Layout protegido
│   │   ├── segmentos/
│   │   ├── templates/
│   │   ├── campañas/
│   │   ├── respuestas/
│   │   └── dashboard/
│   ├── encuesta/[token]/     # Landing pública
│   └── api/
│       ├── auth/[...nextauth]/
│       ├── segmentos/
│       ├── campañas/
│       ├── cron/             # Procesador de cola
│       └── webhooks/
├── lib/
│   ├── connectors/           # el abanico de plugins (ver ARCHITECTURE §2)
│   │   ├── types.ts          # interfaz Connector + capabilities
│   │   ├── registry.ts       # discovery (un import por plugin)
│   │   ├── google-sheets.ts
│   │   ├── resend.ts
│   │   ├── meta-wa-cloud.ts
│   │   └── telnyx-sms.ts
│   ├── segments.ts           # query builder sobre el padrón
│   ├── relationship.ts       # ficha de relación + health score
│   ├── quota.ts              # tracking de free tier
│   ├── auth.ts               # NextAuth config
│   └── opt-out.ts
├── components/               # shadcn/ui (subset minimalista)
├── VISION.md                 # el sentido
├── PLAN.md                   # este archivo (roadmap)
├── ARCHITECTURE.md           # el cómo técnico
├── PROVIDERS.md              # el catálogo de servicios
└── README.md
```

## Variables de entorno (target)

```env
# Auth
NEXTAUTH_URL=
NEXTAUTH_SECRET=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
ALLOWED_EMAILS=email1@dominio.com,email2@dominio.com

# Google Sheets
GOOGLE_SHEETS_SHEET_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_KEY=  # base64 del JSON

# Channels (todos opcionales, se activan si están seteados)
RESEND_API_KEY=
META_WA_PHONE_NUMBER_ID=
META_WA_ACCESS_TOKEN=
META_WA_VERIFY_TOKEN=
TELNYX_API_KEY=
TELNYX_MESSAGING_PROFILE_ID=

# Cron seguridad
CRON_SECRET=
```

## Consideraciones legales y operativas

### Ley 25.326 (Protección de Datos Personales, AR)

- **Base legal**: interés legítimo de investigación social con propósito declarado — no comercial, no electoral. Es el encuadre que sostiene todo el acceso a providers (ver [VISION.md §6](./VISION.md)).
- **Inscripción de la base** ante la AAIP (Agencia de Acceso a la Información Pública) antes de F3.
- **El padrón se queda en el Sheet del cliente.** No se exporta a terceros más allá del destino de cada mensaje.
- **Trazabilidad**: cada envío logea qué dato se usó (DNI parcial, no completo), cuándo, por quién y para qué campaña (hoja `envios`).
- **Derechos ARCO**: acceso, rectificación y supresión. La tabla `opt_outs` implementa la supresión funcional y se consulta **antes** de cada envío, en todos los canales.

### Consentimiento y disclosure

- Primer contacto declara propósito: *"Investigación de opinión pública. No es campaña electoral. No vendemos nada."*
- Identificación clara del remitente: *"Equipo de relevamiento [Org]"*.
- Opt-out inmediato en **todos** los mensajes: *"Para no recibir más mensajes: [link/BAJA]"*.

### Deliverabilidad y seguridad

- **Warm-up de dominio email** gradual (empezar 100/día, doblar semanal) para no caer en blacklist; mantener bounce < 2%.
- **WhatsApp**: si la tasa de bloqueo del usuario supera 2% en una campaña, pausa automática.
- **SMS**: consultar normativa ENACOM si se supera 10k SMS/mes.
- Credenciales (service account, API keys) **nunca** en client; siempre en API routes server-side. OAuth con allowlist, sin auto-registro. Backups periódicos del spreadsheet a otro Drive.

## Riesgos conocidos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Google Sheets como DB no escala (~10M celdas máx) | Si padrón >100k filas, evaluar BigQuery o Postgres. Sheets sigue siendo capa de I/O para usuario. |
| Rate limits de providers en bursts | Cola con scheduler, batches respetando límite más restrictivo del canal |
| WhatsApp rechaza templates marketing | Aplicar como vertical "Survey/Research", redactar templates con tono de invitación a investigación |
| Bounce rate alto destruye reputación SMTP | Validar emails antes (regex + opcional verifier API), warm-up gradual |
| Ley 25.326 | Registro AAIP de la base, disclosure en cada mensaje, opt-out funcional |

## Bloqueantes para F1

1. ID del Sheet del padrón (o autorización a usar uno placeholder para mock)
2. Service account de Google con permiso editor sobre ese Sheet
3. Credenciales OAuth de Google para auth (Client ID + Secret)
4. Lista de emails autorizados (allowlist inicial)

Ninguno frena el **scaffold de F1** (infra de conectores + panel vacío + conector Google Sheets contra un Sheet mock propio de 100 filas). Los necesitamos recién para el **F1 productivo** contra el padrón real — donde el cambio es de 1 línea en la config del conector. El próximo paso concreto está detallado en [ARCHITECTURE.md §13](./ARCHITECTURE.md).

## Decisiones pendientes (no bloquean F1)

- **Dominio de envío** (`severotronador.ar`, `encuestas.maipu.gob.ar`, …) — necesario para configurar Resend y registros SPF/DKIM. Se necesita recién en **F3**.
- **¿A nombre de qué entidad se inscribe la base ante la AAIP?** (persona física, ONG, municipio) — antes de F3.
- **¿Integramos Chatwoot** para tickets de respuesta libre? — decidir antes de **F4**.
- **¿Pipeline cualitativo con LLM en F6 o F7?** — depende del volumen real de respuestas abiertas.
- **¿PWA dedicada para encuestadores en campo?** — post-F5.

## Calendario tentativo

| Fase | Estimación |
|---|---|
| F1 (scaffold) | 1 sesión |
| F2 (segmentos) | 1 sesión |
| F3 (email real) | 1 sesión + 1 día de DNS warm-up |
| F4 (WhatsApp) | 2 sesiones + ~5–10 días hábiles de aprobación de templates Meta |
| F5–F8 | ~1 sesión cada una |

> **Total mínimo a producción multicanal**: ~3–4 semanas calendario, asumiendo provisión rápida de credenciales. El cuello de botella real es la aprobación de templates de Meta (F4), no el desarrollo.
