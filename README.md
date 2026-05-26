# severo-tronador

Toma **tu base de contactos** (el padrón enriquecido de Maipú) y le da **segmentación fina** + una **estrategia multicanal asistida** para contactar a las personas correctas, por el medio correcto, y **obtener respuestas** — comunicación, encuestas e intercambios. Cada servicio (email, WhatsApp, SMS, voz, Telegram, listening…) es un **conector tipo plugin** que se activa desde la app, y el sistema está optimizado para **maximizar los recursos gratuitos** sin quemar la relación con cada contacto.

> **Scope**: investigación social y opinión pública. **No** se usa para campañas electorales ni posicionamiento de candidatos.

## Estado actual

🚧 **F0 — Plan y diseño**. La app aún no está scaffoldeada. Siguiente: **F1 — scaffold + panel de conectores + Google Sheets**.

## Documentación

- 🧭 [VISION.md](./VISION.md) — El sentido: por qué existe y qué es en esencia
- 📋 [PLAN.md](./PLAN.md) — Roadmap único (fases F0→F8), capa de datos, stack
- 🏗️ [ARCHITECTURE.md](./ARCHITECTURE.md) — El cómo técnico: modelo de conectores, fidelización, UI
- 📡 [PROVIDERS.md](./PROVIDERS.md) — El abanico de servicios: comparativa por canal (+ voz IA, open source, listening por tiers)
- 📄 [docs/SEVERO_TRONADOR_Research.docx](./docs/SEVERO_TRONADOR_Research.docx) — Research técnico completo (fuente de la estrategia y arquitectura)

## Stack (planificado)

- **Next.js 15** + TypeScript + Tailwind + shadcn/ui
- **NextAuth** con Google OAuth
- **Google Sheets API** como base de datos
- **Resend** (email) · **Meta WhatsApp Cloud API** · **Telnyx** (SMS + voz)
- Deploy en **Vercel** (incluye Cron jobs)

## Setup (cuando la app exista)

```bash
npm install
cp .env.example .env.local
# editar .env.local con credenciales (ver PLAN.md)
npm run dev
```

## Próximos pasos

Ver fases en [PLAN.md](./PLAN.md#fases-de-entrega-roadmap-único). El siguiente paso es **F1 — Scaffold Next.js + auth + panel de conectores + conector Google Sheets**.
