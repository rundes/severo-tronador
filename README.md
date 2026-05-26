# severo-tronador

Plataforma de contactación segmentada para **relevamientos territoriales y encuestas de opinión** sobre el padrón enriquecido de Maipú. Capa de datos en Google Sheets, envío multicanal (email, WhatsApp, SMS, voz), tracking de respuestas y opt-outs.

> **Scope**: investigación social y opinión pública. **No** se usa para campañas electorales ni posicionamiento de candidatos.

## Estado actual

🚧 **F0 — Plan y diseño**. La app aún no está scaffoldeada.

## Documentación

- 📋 [PLAN.md](./PLAN.md) — Arquitectura, fases, stack
- 📡 [PROVIDERS.md](./PROVIDERS.md) — Comparativa exhaustiva de proveedores por canal

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

Ver fases en [PLAN.md](./PLAN.md#fases-de-entrega). El siguiente paso es **F1 — Scaffold Next.js + auth + Sheets**.
