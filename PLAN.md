# Severo Tronador — Plan de implementación

> Plataforma web para diseñar segmentos sobre el padrón enriquecido de Maipú, ejecutar campañas de contactación multicanal con propósito **investigativo / encuestas**, y registrar todo en Google Sheets como capa de datos.

## Alcance

**Sí**: relevamientos territoriales, encuestas cuali/cuanti, opinión pública, métricas de campo.
**No**: propaganda electoral, posicionamiento de candidatos, fundraising político.

Este encuadre nos posiciona como herramienta de **investigación social** (vertical Market Research), lo que destraba prácticamente todos los providers comerciales (ver [PROVIDERS.md](./PROVIDERS.md)).

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

## Capa de datos — Google Sheets (7 hojas)

| Hoja | Rol | Columnas clave |
|---|---|---|
| `padron` | Read-only, fuente | DNI, nombre, apellido, fecha_nac, sexo, domicilio, barrio, circuito, mesa, telefono, email |
| `segmentos` | Audiencias guardadas | id, nombre, filtros_json, tamaño, creado_por, creado_at |
| `templates` | Plantillas por canal | id, canal, nombre, asunto, cuerpo (vars `{{nombre}}`, `{{barrio}}`), estado |
| `campañas` | Metadata | id, nombre, canal, template_id, segmento_id, estado, scheduled_at, métricas |
| `envios` | 1 fila por destinatario × campaña | campaña_id, dni, canal, destino, estado, sent_at, delivered_at, opened_at, replied_at, error |
| `respuestas` | Respuestas a encuestas | envio_id, pregunta, respuesta, timestamp |
| `opt_outs` | Bajas globales | identificador (dni/tel/email), canal, fecha, motivo |

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

## Fases de entrega

| # | Entregable | Salida | Status |
|---|---|---|---|
| **F0** | Repo + plan + investigación de providers | Este doc + PROVIDERS.md | ✅ Hecho |
| **F1** | Scaffold Next.js + auth Google + conexión Sheets (mock padrón) | App corriendo local | ⏳ Siguiente |
| **F2** | Lectura del padrón + constructor de segmentos con preview | UI funcional sin envíos | |
| **F3** | Templates + creación de campañas + **envío real email** (Resend) | E2E primer canal | |
| **F4** | WhatsApp (Meta Cloud API) con templates aprobados | 2 canales activos | |
| **F5** | SMS + registro de llamadas | Multi-canal completo | |
| **F6** | Encuestas públicas `/encuesta/[token]` con tracking | Captura de respuestas | |
| **F7** | Dashboard + opt-out automático cross-channel + dedupe | Producción-ready | |

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
│   ├── sheets.ts             # Cliente Google Sheets
│   ├── segments.ts           # Query builder
│   ├── channels/
│   │   ├── resend.ts
│   │   ├── whatsapp.ts
│   │   └── telnyx.ts
│   ├── auth.ts               # NextAuth config
│   └── opt-out.ts
├── components/               # shadcn/ui
├── PLAN.md                   # este archivo
├── PROVIDERS.md
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

Ninguno frena F0 (scaffold), pero los necesitamos para F1 productivo.
