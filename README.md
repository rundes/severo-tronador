# severo-tronador

Toma **tu base de contactos** y le da **segmentación fina** + una **estrategia multicanal asistida** para contactar a las personas correctas, por el medio correcto, y **obtener respuestas** — comunicación, encuestas e intercambios. Cada servicio (email, WhatsApp, SMS, voz, Telegram, listening…) es un **conector tipo plugin** que se activa desde la app, y el sistema está optimizado para **maximizar los recursos gratuitos** sin quemar la relación con cada contacto.

> **Scope**: investigación social y opinión pública. **No** se usa para campañas electorales ni posicionamiento de candidatos.

## Estado actual

✅ **Roadmap F0→F8 completo** (scaffold + mock). App Next.js con: panel de conectores, lectura del padrón, segmentos + health score, plantillas, campañas multicanal (email/WhatsApp/SMS/voz) con cuotas y cooldowns, encuestas públicas tokenizadas + opt-out, análisis cualitativo + dashboard de cierre, y listening pasivo con alertas de tema emergente.

Todos los conectores corren en **modo mock** sin credenciales; el envío/listening real se activa seteando las env vars (ver `.env.example`). Pendiente de producción: persistencia en Google Sheets (hoy en memoria), Vercel Cron para la cola de envíos, y plantillas WhatsApp aprobadas por Meta.

## Documentación

- 🧭 [VISION.md](./VISION.md) — El sentido: por qué existe y qué es en esencia
- 📋 [PLAN.md](./PLAN.md) — Roadmap único (fases F0→F8), capa de datos, stack
- 🏗️ [ARCHITECTURE.md](./ARCHITECTURE.md) — El cómo técnico: modelo de conectores, fidelización, UI
- 📡 [PROVIDERS.md](./PROVIDERS.md) — El abanico de servicios: comparativa por canal (+ voz IA, open source, listening por tiers)
- 📄 [docs/SEVERO_TRONADOR_Research.docx](./docs/SEVERO_TRONADOR_Research.docx) — Research técnico completo (fuente de la estrategia y arquitectura)

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

## Próximos pasos

Roadmap F0→F8 completo (ver [PLAN.md](./PLAN.md#fases-de-entrega-roadmap-único)). Para llevar a producción: cargar credenciales reales, migrar la persistencia en memoria a Google Sheets, y agregar Vercel Cron para la cola de envíos.
