# Integraciones — conectar herramientas paso a paso

> Cada servicio externo es un **conector** (plugin). Sin credenciales, todos
> corren en **modo mock** (simulan su función y consumen cuota igual) para que
> puedas probar el flujo completo. Activar el modo real = setear las variables
> de entorno del conector en `.env.local` (o en Vercel) y reiniciar.
>
> **Desde el panel**: además de env vars, podés configurar cada conector en
> `/conectores → Configurar` (requiere Supabase + `CONFIG_MASTER_KEY`). Lo
> guardado ahí se encripta y **tiene prioridad sobre la env var**; el modal
> linkea a la sección de esta guía para saber de dónde sacar cada dato.
>
> Tabla de contenidos: [Identidad](#0-identidad-del-despliegue) ·
> [Google OAuth](#1-google-oauth-auth) · [Google Sheets](#2-google-sheets-datos) ·
> [Resend](#3-resend-email) · [Meta WhatsApp](#4-meta-cloud-api-whatsapp) ·
> [Telnyx SMS](#5-telnyx-sms) · [Telnyx Voz](#6-telnyx-voz--ivr) ·
> [Claude](#7-claude-api-análisis) · [GDELT](#8-gdelt-listening) ·
> [X API](#9-x-api-listening) · [Reddit](#10-reddit-api-listening) ·
> [Agregar un conector nuevo](#agregar-un-conector-nuevo)

---

## 0. Identidad del despliegue

Genérico por defecto. Personalizá sin tocar código:

```env
APP_NAME=mi-relevamiento          # branding del sidebar
ORG_NAME=el equipo de XYZ         # firma en encuestas/mensajes
TERRITORY=la ciudad de XYZ        # textos de listening
```

---

## Persistencia — Supabase (base operativa)

La app usa **Supabase (Postgres)** como base de datos operativa. Sin estas env
vars cae a stores en memoria (dev/mock); con ellas persiste de verdad.

**Pasos**
1. Crear proyecto en [supabase.com/dashboard](https://supabase.com/dashboard).
2. *Settings → API*: copiar **Project URL** (`SUPABASE_URL`) y la **`service_role` key** (`SUPABASE_SERVICE_ROLE_KEY`). La service_role es secreta — solo server-side.
3. *SQL Editor*: pegar y correr `supabase/migrations/0001_init.sql` (crea todas las tablas).
4. Generar la master key de encriptación de credenciales: `openssl rand -base64 32` → `CONFIG_MASTER_KEY`.
5. (Para el espejo a Sheets) crear un Google Sheet de preservación con las 8 hojas (`padron, segmentos, templates, campañas, envios, respuestas, opt_outs, llamadas`), compartirlo con la service account de Google, y poner su ID en `SHEETS_PRESERVATION_SHEET_ID`. Definir `CRON_SECRET` para proteger el cron.

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
CONFIG_MASTER_KEY=               # openssl rand -base64 32
SHEETS_PRESERVATION_SHEET_ID=
CRON_SECRET=
```

**Cómo funciona el espejo**: cada escritura preservable encola una fila en
`sheets_sync_queue`; el Vercel Cron `/api/cron/sheets-sync` la drena a Sheets
(batching + backoff). Supabase = operativo; Sheets = preservación / consulta
externa.

Ref: [Supabase Docs](https://supabase.com/docs) · [JS client](https://supabase.com/docs/reference/javascript)

---

## 1. Google OAuth (`auth`)

Login de operadores con cuenta Google + allowlist por email.

**Pasos**
1. [Google Cloud Console](https://console.cloud.google.com/) → crear proyecto.
2. *APIs & Services → OAuth consent screen* → tipo **External**, completar datos, agregar tu email como test user.
3. *APIs & Services → Credentials → Create Credentials → OAuth client ID* → tipo **Web application**.
4. Authorized redirect URI: `https://TU_DOMINIO/api/auth/callback/google` (y `http://localhost:3000/api/auth/callback/google` para dev).
5. Copiar Client ID y Secret.
6. Generar un secret: `openssl rand -base64 32`.

```env
NEXTAUTH_URL=https://TU_DOMINIO
NEXTAUTH_SECRET=<openssl rand -base64 32>
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
ALLOWED_EMAILS=ana@org.com,juan@org.com   # vacío = cualquiera (solo dev)
```

Ref: [Auth.js · Google](https://authjs.dev/getting-started/providers/google)

---

## 2. Google Sheets (`datos`)

Padrón como base de datos (lectura). Sin credenciales usa el padrón mock de 100 filas.

**Pasos**
1. [Google Cloud Console](https://console.cloud.google.com/) → habilitar **Google Sheets API**.
2. *Credentials → Create Credentials → Service account* → crear.
3. En la service account → *Keys → Add key → JSON* → descargar.
4. Codificar el JSON en base64: `base64 -w0 service-account.json` (Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account.json"))`).
5. Compartir el Google Sheet del padrón con el email de la service account (permiso Lector).
6. Tomar el Sheet ID de la URL (`docs.google.com/spreadsheets/d/<ESTE_ID>/edit`).
7. La hoja del padrón debe llamarse `padron`, con encabezados en la fila 1 (`dni, nombre, apellido, fecha_nac, sexo, domicilio, barrio, circuito, mesa, telefono, email`).

```env
GOOGLE_SHEETS_SHEET_ID=...
GOOGLE_SERVICE_ACCOUNT_EMAIL=svc@proyecto.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_KEY=<base64 del JSON>
```

Ref: [Sheets API](https://developers.google.com/sheets/api) · [Service accounts](https://cloud.google.com/iam/docs/service-accounts)

---

## 3. Resend (`email`)

3.000 emails/mes gratis. Sin key simula el envío.

**Pasos**
1. Crear cuenta en [resend.com](https://resend.com).
2. *Domains → Add Domain* → cargar tu dominio → agregar los registros **SPF/DKIM** que indica en tu DNS → verificar.
3. *API Keys → Create API Key* (permiso Send).
4. Definir el remitente con tu dominio verificado.

```env
RESEND_API_KEY=re_...
RESEND_FROM=relevamiento@encuestas.tu-dominio.com
```

Ref: [Resend Docs](https://resend.com/docs) · [Dominios/DNS](https://resend.com/docs/dashboard/domains/introduction)

---

## 4. Meta Cloud API (`WhatsApp`)

1.000 conversaciones service-initiated gratis/mes, directo (sin intermediario). Sin credenciales simula.

**Pasos**
1. Crear app en [Meta for Developers](https://developers.facebook.com/) → producto **WhatsApp**.
2. Tener un **Business Manager** verificado; registrar el caso como vertical **Market Research / Survey** (no electoral).
3. Obtener el **Phone Number ID** y un **Access Token** (permanente vía System User recomendado).
4. Configurar webhook: URL `https://TU_DOMINIO/api/webhooks/meta`, **Verify Token** a tu elección (debe coincidir con la env), suscribir el campo `messages`.
5. Copiar el **App Secret** desde *Settings → Basic → App Secret*. Es requerido en producción: el POST del webhook valida `x-hub-signature-256` (HMAC-SHA256 sobre el raw body) usando esa clave.
6. Crear y **pre-aprobar plantillas** (invitación, recordatorio, agradecimiento) en *WhatsApp Manager → Message Templates*.

```env
META_WA_PHONE_NUMBER_ID=...
META_WA_ACCESS_TOKEN=...
META_WA_VERIFY_TOKEN=<string a tu elección>
META_WA_APP_SECRET=<App Secret de la Meta App>
```

> Fuera de la ventana de 24h, WhatsApp exige plantilla aprobada. El envío real
> actual usa `type=text` (válido en 24h); mapear plantillas aprobadas es el
> siguiente paso (ver [STABILIZATION.md](./STABILIZATION.md)).
>
> Sin `META_WA_APP_SECRET`, todo POST al webhook devuelve 403. Para tests
> locales, setear cualquier string y firmar el body con `createHmac("sha256",
> secret)`.

Ref: [Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api) · [Webhooks](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks)

---

## 5. Telnyx SMS

Pago (~$0.04/SMS AR), sin free tier. Tope mensual configurable como guardarraíl. Sin key simula.

**Pasos**
1. Crear cuenta en [telnyx.com](https://telnyx.com) y cargar saldo.
2. Comprar un número con capacidad SMS.
3. *Messaging → Messaging Profiles* → crear → tomar el **Messaging Profile ID**.
4. *API Keys* → crear.

```env
TELNYX_API_KEY=KEY...
TELNYX_MESSAGING_PROFILE_ID=...
TELNYX_SMS_MONTHLY_CAP=2000   # opcional, default 2000
```

Ref: [Telnyx Messaging](https://developers.telnyx.com/docs/messaging)

---

## 6. Telnyx Voz / IVR

Llamada saliente automática (guion TTS = cuerpo de la plantilla). Sin key simula.

**Pasos**
1. En Telnyx: *Voice → Call Control / Connections* → crear una **Voice API Connection** → tomar el **Connection ID**.
2. Asignar un número con capacidad de voz como `from`.

```env
TELNYX_API_KEY=KEY...            # mismo que SMS
TELNYX_VOICE_CONNECTION_ID=...
TELNYX_VOICE_FROM=+5491100000000
TELNYX_VOICE_MONTHLY_CAP=500     # opcional, default 500
```

> Para encuestas **conversacionales** con IA (no menú IVR), evaluar el conector
> futuro `bland-ai`/`vapi` (ver [PROVIDERS.md](../PROVIDERS.md) §7.1).

Ref: [Telnyx Voice](https://developers.telnyx.com/docs/voice)

---

## 7. Claude API (`análisis`)

Coding cualitativo + sentiment de respuestas abiertas. Sin key usa heurística local (frecuencia de términos + léxico).

**Pasos**
1. Crear cuenta en [console.anthropic.com](https://console.anthropic.com/) y cargar créditos.
2. *API Keys → Create Key*.

```env
ANTHROPIC_API_KEY=sk-ant-...
```

Ref: [Anthropic Docs](https://docs.anthropic.com/) · costo orientativo: Haiku ≈ $1/M tokens input.

---

## 8. GDELT (`listening`)

Prensa mundial geo-codificada, **gratis y sin API key**. Hoy en mock; el real consulta la DOC 2.0 API.

> **Config de escucha** (aplica a GDELT, X y Reddit): la zona, país, radio,
> keywords y qué fuentes usar se configuran desde `/escucha → Configurar escucha`
> (se guardan en `listening_config`). `runListening` arma el `ListenQuery` desde
> esa config; cada conector la traduce a su API en el modo real (GDELT por
> `sourcecountry`+location, X por place/keyword, Reddit por keyword).

**Pasos**
1. Sin credenciales. Para el modo real, consultar la [DOC 2.0 API](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/) con `query=<keywords> sourcecountry:AR` y filtro temporal.

Ref: [GDELT Project](https://www.gdeltproject.org/)

---

## 9. X API (`listening`)

Basic Tier: 1.500 tweets/mes gratis. Sin token simula.

**Pasos**
1. [developer.x.com](https://developer.x.com/) → crear proyecto/app.
2. Generar **Bearer Token**.

```env
X_API_BEARER_TOKEN=...
X_TIMELINE_BATCH=50   # handles por corrida del cron de timelines (opcional)
```

**Posteos por contacto (escucha activa).** Al importar contactos, cada
`x_handle` se encola en `x_handle_queue`. El cron `/api/cron/x-timeline`
(GitHub Actions cada 6h, `.github/workflows/x-timeline.yml`) drena la cola:
por cada handle trae sus **últimos 5 posteos** vía `search/recent` con
`from:handle` y los upserta en `listening_items` (`kind="tweet"`, dedupe por
url). Cubre los **últimos ~7 días** (límite de recent search).

> **Por qué search/recent y no el timeline del usuario.** Los endpoints
> `/2/users/by/username` y `/2/users/:id/tweets` (que darían los últimos N sin
> importar la fecha) exigen plan **pago** — con el token free devuelven
> `HTTP 402`. `search/recent` es el endpoint del free tier. Si en el futuro se
> contrata un plan superior, se puede volver al timeline para ventana
> ilimitada.

Respeta el free tier (1.500 tweets/mes, compartido con la búsqueda):
presupuesta hasta 10 tweets por handle (mínimo de recent search; guarda 5),
procesa `X_TIMELINE_BATCH` handles por corrida (default 50) y deja el resto
`pending` para la próxima — los descartados por cuota se loguean
(`x_timeline.quota_exhausted`). Sin token, la cola no se procesa.

Ref: [X API v2 · recent search](https://developer.x.com/en/docs/x-api/tweets/search/introduction)

---

## 10. Reddit API (`listening`)

Gratis con límites razonables. Sin credenciales simula.

**Pasos**
1. [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) → *Create app* → tipo **script**.
2. Tomar Client ID y Secret.

```env
REDDIT_CLIENT_ID=...
REDDIT_CLIENT_SECRET=...
```

Ref: [Reddit API](https://www.reddit.com/dev/api)

---

## Agregar un conector nuevo

La arquitectura es **abierta por diseño**: sumar una herramienta = un archivo +
una línea en el registry. Cero cambios en la UI o la lógica de negocio. Hay tres
familias soportadas hoy.

### a) Importación de bases de datos (`data`)

Implementá `DataConnector` (`lib/connectors/types.ts`):

```ts
export const miFuente: DataConnector = {
  id: "airtable", name: "Airtable", vendor: "...", category: "data",
  description: "...", docsUrl: "...", iconEmoji: "🗃️",
  capabilities: [{ id: "padron.read", label: "Leer padrón" }],
  configSchema: [{ key: "AIRTABLE_TOKEN", label: "Token", type: "secret", required: true }],
  async test() { /* ping */ return { ok: true, message: "..." }; },
  async getStatus() { return "enabled"; },
  async readPadron(_cfg, opts) { /* devolver Contact[] */ return []; },
};
```

Casos típicos: Airtable, Postgres/Supabase, CSV upload, BigQuery. El resto de la
app (segmentos, fichas, campañas) ya consume `readPadron()` sin saber de dónde
viene. Hoy el padrón lo lee `google-sheets`; cualquier `data` connector lo
reemplaza cambiando la fuente en `lib/segments.ts → loadContacts`.

### b) Análisis (`analysis`)

Implementá `AnalysisConnector` con `analyze(input, task)`. Tasks soportadas:
`sentiment`, `coding_qualitative`, `cluster`. Casos: embeddings/clustering
(OpenAI, Cohere), traducción, NER. `lib/analysis.ts` orquesta el de cierre.

### c) Contactación (`outreach`)

Implementá `OutreachConnector` con `send(message, recipient)`,
`estimateQuotaImpact(count)` y `getQuota()`. Casos: Brevo o Listmonk (email a
escala), 360dialog (WhatsApp), Telegram Bot, Bland AI (voz IA). Sumalo al mapa
`CONNECTOR_BY_CHANNEL` en `lib/campaigns.ts` para que sea elegible como canal de
campaña.

### Pasos comunes

1. Crear `lib/connectors/mi-conector.ts` implementando la interfaz de su categoría.
2. Patrón mock-capable: si faltan las env vars, simular y devolver `ok`.
3. Registrarlo en `lib/connectors/registry.ts` (un import + una línea en `connectors[]`).
4. (outreach) agregarlo a `CONNECTOR_BY_CHANNEL` en `lib/campaigns.ts`.
5. Documentar sus env vars acá y en `.env.example`.

Aparece solo en el panel `/conectores`, agrupado por categoría, con su estado y
cuota. **No hay que tocar nada más.**
