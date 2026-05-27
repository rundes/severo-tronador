# severo-tronador

Toma **tu base de contactos** (el padrón enriquecido de Maipú, prov. de Buenos Aires) y le da **segmentación fina** + una **estrategia multicanal asistida** para contactar a las personas correctas, por el medio correcto, y **obtener respuestas** — comunicación, encuestas e intercambios. Cada servicio (email, WhatsApp, SMS, voz, Telegram, listening…) es un **conector tipo plugin** que se activa desde la app, y el sistema está optimizado para **maximizar los recursos gratuitos** sin quemar la relación con cada contacto.

> **Scope**: investigación social y opinión pública. **No** se usa para campañas electorales ni posicionamiento de candidatos.

## Estado actual

✅ **F1 — scaffold hecho** (branch `f1-scaffold`). App Next.js corriendo local con la infraestructura de conectores, panel de conectores, y conector Google Sheets contra un padrón mock de 100 filas. Auth NextAuth lista (se activa al setear credenciales).

Siguiente: **F2 — lectura del padrón + constructor de segmentos + ficha de contacto + health score**.

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

Ver fases en [PLAN.md](./PLAN.md#fases-de-entrega-roadmap-único). El siguiente paso es **F2 — padrón + segmentos + ficha de contacto + health score**.
