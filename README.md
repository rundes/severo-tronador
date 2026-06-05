# severo-tronador

Plataforma de **investigación social y opinión pública**: toma tu base de
contactos (padrón / lista enriquecida) y le da **segmentación fina** + una
**estrategia multicanal asistida** para contactar a las personas correctas, por
el medio correcto, y **obtener respuestas** (comunicación, encuestas, escucha).
Cada servicio (email, WhatsApp, SMS, voz, Telegram, listening…) es un **conector
tipo plugin** que se activa desde la app, optimizado para **maximizar recursos
gratuitos** sin quemar la relación con cada contacto.

Genérica: el nombre del equipo, el territorio y el branding se configuran por env
(`ORG_NAME`, `TERRITORY`, `APP_NAME`).

> **Scope:** investigación social y opinión pública. **No** se usa para campañas
> electorales ni posicionamiento de candidatos.

## Estado

**En producción** (Vercel + Supabase). Multi-tenant: proyectos con membresía y
roles (owner / editor / viewer). Sin las credenciales de un conector, ese
conector queda inactivo (o mock en dev local); el resto sigue funcionando.

## Módulos

- **Contactos / padrón** — import CSV o sync Google Sheet (mapeo de columnas) +
  tabla paginada.
- **Segmentos** — filtros (sexo, edad, barrio, salud de la relación…) + health
  score, sobre el padrón completo.
- **Plantillas** y **Campañas** multicanal (email/WhatsApp/SMS/voz/Telegram) con
  cuota por proyecto, cooldowns, opt-out global, A/B y tracking apertura/clicks.
- **Flows** — secuencias condicionales.
- **Encuestas** — builder tipado (texto, opción única/múltiple, escala, sí/no),
  **diseños** (minimalista / paso a paso agrupable), portada con imagen + cierre
  con CTA, **URL pública** + envío por mail a un segmento, **dashboard** de
  monitoreo + export CSV. Respuestas en DB + espejo a Google Sheet.
- **Mail** `@tronador.net.ar` — Cloudflare Email Routing (recepción) + Resend
  (envío), bandeja in-app, tracking. Sin VPS.
- **Escucha** — listening pasivo: GDELT (prensa), RSS de medios locales editables,
  X (timelines públicos por sindicación gratis, o worker twscrape), con detección
  de temas emergentes, sentiment y feed.
- **Respuestas**, **Conectores**, **Proyecto** (miembros), **Auditoría**.

## Stack

- **Next.js 15** (App Router, Turbopack) + TypeScript + Tailwind v4
- **NextAuth v5** (Google OAuth + allowlist por email)
- **Supabase** (Postgres) = fuente de verdad · **Google Sheets** = espejo de
  preservación
- Conectores: **Resend**, **Meta WhatsApp Cloud**, **Telnyx** (SMS+voz),
  **Telegram**, **GDELT/RSS/X**, **Claude API**
- Deploy en **Vercel**; crons vía **GitHub Actions**

## Setup (dev)

```bash
npm install
cp .env.example .env.local   # sin credenciales corre en modo mock/memoria
npm run dev                  # http://localhost:3000
```

Calidad: `npm test` · `npx tsc --noEmit` · `npm run lint` · `npm run build`.

## Base de datos

Migraciones en `supabase/migrations/` (Postgres). RLS deny-all; el acceso real
es por cliente service-role en la capa server (`lib/db/`).

## Infra (fuera de Vercel)

- `infra/cloudflare-email-worker/` — Email Worker de Cloudflare que postea el
  mail entrante al webhook de la app. Runbook: `CLOUDFLARE-RESEND-RUNBOOK.md`.
- `infra/twikit-worker/` — worker (twscrape) que trae timelines de X a
  `listening_items`. Corre en una PC/VPS, no en Vercel. Ver su `README.md`.

## Documentación

- 🧭 [VISION.md](./VISION.md) — por qué existe y qué es en esencia
- 🏗️ [ARCHITECTURE.md](./ARCHITECTURE.md) — modelo de conectores, fidelización, UI
- 📡 [PROVIDERS.md](./PROVIDERS.md) — comparativa de servicios por canal
- 🔌 [docs/INTEGRATIONS.md](./docs/INTEGRATIONS.md) — conectar cada herramienta + agregar conectores
