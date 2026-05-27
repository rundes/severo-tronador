# severo-tronador

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/rundes/severo-tronador&project-name=severo-tronador&repository-name=severo-tronador&env=NEXTAUTH_SECRET,GOOGLE_OAUTH_CLIENT_ID,GOOGLE_OAUTH_CLIENT_SECRET,ALLOWED_EMAILS,GOOGLE_SHEETS_SHEET_ID,GOOGLE_SERVICE_ACCOUNT_KEY,RESEND_API_KEY,RESEND_FROM&envDescription=Todas%20opcionales:%20sin%20ellas%20la%20app%20corre%20en%20modo%20mock&envLink=https://github.com/rundes/severo-tronador/blob/main/docs/INTEGRATIONS.md) · 📖 [Documentación](https://rundes.github.io/severo-tronador/)

Toma **tu base de contactos** (tu padrón o lista enriquecida) y le da **segmentación fina** + una **estrategia multicanal asistida** para contactar a las personas correctas, por el medio correcto, y **obtener respuestas** — comunicación, encuestas e intercambios. Cada servicio (email, WhatsApp, SMS, voz, Telegram, listening…) es un **conector tipo plugin** que se activa desde la app, y el sistema está optimizado para **maximizar los recursos gratuitos** sin quemar la relación con cada contacto.

La herramienta es **genérica**: no está atada a ningún territorio ni organización. El nombre del equipo, el territorio y el branding se configuran por variables de entorno (`ORG_NAME`, `TERRITORY`, `APP_NAME`).

> **Scope**: investigación social y opinión pública. **No** se usa para campañas electorales ni posicionamiento de candidatos.

## Estado actual

✅ **Roadmap F0→F8 completo** (scaffold + mock). App Next.js con: panel de conectores, lectura del padrón, segmentos + health score, plantillas, campañas multicanal (email/WhatsApp/SMS/voz) con cuotas y cooldowns, encuestas públicas tokenizadas + opt-out, análisis cualitativo + dashboard de cierre, y listening pasivo con alertas de tema emergente.

Todos los conectores corren en **modo mock** sin credenciales; el envío/listening real se activa seteando las env vars (ver `.env.example`). Pendiente de producción: persistencia en Google Sheets (hoy en memoria), Vercel Cron para la cola de envíos, y plantillas WhatsApp aprobadas por Meta.

## Documentación

- 🧭 [VISION.md](./VISION.md) — El sentido: por qué existe y qué es en esencia
- 📋 [PLAN.md](./PLAN.md) — Roadmap único (fases F0→F8), capa de datos, stack
- 🏗️ [ARCHITECTURE.md](./ARCHITECTURE.md) — El cómo técnico: modelo de conectores, fidelización, UI
- 📡 [PROVIDERS.md](./PROVIDERS.md) — El abanico de servicios: comparativa por canal (+ voz IA, open source, listening por tiers)
- 🔌 [docs/INTEGRATIONS.md](./docs/INTEGRATIONS.md) — Conectar cada herramienta paso a paso + cómo agregar conectores nuevos
- 🧰 [docs/STABILIZATION.md](./docs/STABILIZATION.md) — Hallazgos de revisión + plan de mejoras para producción
- 📄 [docs/SEVERO_TRONADOR_Research.docx](./docs/SEVERO_TRONADOR_Research.docx) — Research técnico original (artefacto histórico)

## Stack

- **Next.js 16** (App Router, Turbopack) + TypeScript + Tailwind v4
- **NextAuth v5** con Google OAuth + allowlist por email
- **Google Sheets API** (`googleapis` + service account) como base de datos
- **Resend** (email) · **Meta WhatsApp Cloud API** · **Telnyx** (SMS + voz) — desde F3+
- Deploy en **Vercel** (incluye Cron jobs)

## Setup

```bash
npm install
cp .env.example .env.local   # opcional en F1: sin credenciales corre contra el mock
npm run dev                  # http://localhost:3000 → /conectores
```

Sin `.env.local`, la app usa el padrón mock (100 filas) y la auth queda
deshabilitada para iterar local. Con credenciales reales (ver PLAN.md), el
conector Google Sheets lee el padrón real y se activa el login.

## Deploy

- **La app → Vercel.** Es una app Next.js con render server-side (server
  actions, API routes, webhooks); **no** corre en hosts estáticos como GitHub
  Pages. Hay `vercel.json` y botón de deploy:

  [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/rundes/severo-tronador&project-name=severo-tronador&repository-name=severo-tronador&env=NEXTAUTH_SECRET,GOOGLE_OAUTH_CLIENT_ID,GOOGLE_OAUTH_CLIENT_SECRET,ALLOWED_EMAILS,GOOGLE_SHEETS_SHEET_ID,GOOGLE_SERVICE_ACCOUNT_KEY,RESEND_API_KEY,RESEND_FROM&envDescription=Todas%20opcionales:%20sin%20ellas%20la%20app%20corre%20en%20modo%20mock&envLink=https://github.com/rundes/severo-tronador/blob/main/docs/INTEGRATIONS.md)

  El botón clona el repo y pide (opcionalmente) las env vars. Sin cargar
  ninguna, la app despliega y corre en **modo mock**. Detalle de cada
  credencial en [docs/INTEGRATIONS.md](./docs/INTEGRATIONS.md). La cola con
  Vercel Cron queda pendiente — ver [docs/STABILIZATION.md](./docs/STABILIZATION.md).
- **La documentación → GitHub Pages.** Se publica sola: el workflow
  `.github/workflows/docs.yml` renderiza los markdown a un sitio estático en
  cada push a `main`. URL: `https://rundes.github.io/severo-tronador/`.

## Próximos pasos

Roadmap F0→F8 completo (ver [PLAN.md](./PLAN.md#fases-de-entrega-roadmap-único)). Para llevar a producción: cargar credenciales reales, migrar la persistencia en memoria a Google Sheets, y agregar Vercel Cron para la cola de envíos.
