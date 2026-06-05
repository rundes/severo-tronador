# Severo Tronador — Plan y roadmap

> El **cuándo**: cómo se entregó el sistema, fase por fase. Para el **por qué**
> ver [VISION.md](./VISION.md); para el **cómo técnico** ver
> [ARCHITECTURE.md](./ARCHITECTURE.md); para el **abanico de servicios** ver
> [PROVIDERS.md](./PROVIDERS.md).

---

## Estado

**Todas las fases (F1–F8) están en producción** (Vercel + Supabase). Este
documento conserva el roadmap como referencia histórica y como mapa
fase → conector. No quedan fases pendientes; lo que sigue son mejoras
incrementales sobre la base ya entregada.

El modelo de plugins (ver [ARCHITECTURE.md §2](./ARCHITECTURE.md)) estuvo
presente desde F1: cada fase activó uno o más conectores del registry sin tocar
el core.

---

## Fases de entrega (roadmap único)

Cada fila es una fase ya entregada. La columna **Conectores** mapea a los
módulos de `lib/connectors/` que la fase puso en producción.

| Fase | Qué entregó | Conectores activados |
|---|---|---|
| **F1** | Scaffold Next.js + App Router, NextAuth (Google OAuth + allowlist), infraestructura de conectores, panel `/conectores`, lectura del padrón. | `google-oauth`, `google-sheets` |
| **F2** | Segmentos (filtros sobre el padrón), ficha de relación por contacto, health score, cooldowns. | — (lógica de negocio sobre el padrón) |
| **F3** | Email real con tracking de apertura/clicks y gestión de cuota del free tier. | `resend` |
| **F4** | WhatsApp service-initiated con webhooks (recepción de respuestas y estados). | `meta-wa-cloud` |
| **F5** | SMS y voz/IVR salientes con topes mensuales como guardarraíl. | `telnyx-sms`, `telnyx-voice` |
| **F6** | Encuestas/intercambios tokenizados, builder tipado, opt-out cross-channel, A/B testing de mensajes. | — (encuestas + `lib/ab-test.ts`) |
| **F7** | Análisis cualitativo asistido (coding inductivo/deductivo, sentiment, clustering) + dashboard de cierre. | `claude-api` |
| **F8** | Escucha pasiva: prensa, redes y medios locales con detección de temas emergentes y sentiment. | `gdelt`, `x-api`, `reddit-api`, `rss`, `meta-content-library` |

Conectores adicionales en producción no atados a una fase única:
`telegram-bot` (canal complementario gratuito), `google-sheets-archive`
(espejo de preservación), y la sindicación gratuita de X (`x-syndication`,
fallback sin token pago).

---

## Modelo de datos

**Fuente de verdad operativa: Supabase (Postgres).** Las migraciones viven en
`supabase/migrations/` (`0001_init.sql` en adelante). RLS deny-all; el acceso
real es por cliente service-role en `lib/db/`.

**Espejo de preservación: Google Sheets.** Cada escritura preservable se encola
en `sheets_sync_queue` y un cron la drena al Sheet espejo, que conserva 8 hojas
de consulta externa:

| Hoja | Rol |
|---|---|
| `padron` | Base de contactos (fuente de lectura) |
| `segmentos` | Definiciones de segmentos guardados |
| `templates` | Plantillas de mensaje |
| `campañas` | Campañas y su estado |
| `envios` | Detalle granular de cada interacción saliente |
| `respuestas` | Respuestas a encuestas/intercambios |
| `opt_outs` | Bajas por canal y globales |
| `llamadas` | Registro de llamadas de voz/IVR |

> Histórico: las primeras 7 hojas (`padron`…`opt_outs`) fueron el modelo
> original; `llamadas` se sumó con F5. El estado de conectores, las cuotas y la
> ficha de relación agregada **viven hoy en Supabase** (`conector_config`,
> `quota`, `relationship`), no en hojas de cálculo.

---

## Infra fuera de Vercel

- `infra/cloudflare-email-worker/` — Email Worker de Cloudflare que postea el
  mail entrante al webhook de la app (recepción `@tronador.net.ar`).
- `infra/twikit-worker/` — worker `twscrape` que trae timelines de X a
  `listening_items` para cuentas chicas sin plan pago.

---

## Mejoras incrementales abiertas

No son fases nuevas, sino refinamientos sobre lo entregado:

- **WhatsApp**: mapear plantillas pre-aprobadas para envíos fuera de la ventana
  de 24h (el envío actual usa `type=text`, válido dentro de la ventana).
- **Listening**: ampliar fuentes editables desde `/escucha` (RSS y handles de X
  ya configurables en runtime).
- **Análisis**: nuevos conectores `analysis` (embeddings/clustering alternativos,
  traducción) siguiendo el patrón de `claude-api`.
- **Escala de email**: evaluar Brevo o Listmonk + SES si Resend free queda chico
  (ver [PROVIDERS.md](./PROVIDERS.md)).
