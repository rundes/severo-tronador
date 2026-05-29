# Cloudflare Email Worker — mail inbound serverless

Reemplazo de Stalwart/VPS. Recibe mail dirigido a `@tronador.net.ar`,
calcula HMAC del raw RFC822 con `MAIL_INBOUND_SECRET`, lo postea al
webhook Vercel (`/api/webhooks/mail-in`), que rutea replies al
`respuestas` table.

**Costo:** $0/mes (Cloudflare Email Routing + Workers free tier
sobran para volúmenes hasta 100k mails/día).

## Prereqs (5 min, una vez)

1. Cuenta Cloudflare (free) — `dash.cloudflare.com`.
2. Agregar `tronador.net.ar` al dashboard como sitio:
   - **Add a Site** → ingresar dominio → plan Free.
   - Cloudflare lista 2 nameservers (`xxx.ns.cloudflare.com`).
   - **En el registrar actual del dominio**: cambiar NS a los de Cloudflare.
   - Esperar ~5min propagación. Cloudflare manda email cuando está activo.

## Setup Email Routing (10 min)

1. Dashboard Cloudflare → `tronador.net.ar` → **Email** (sidebar).
2. **Get started** → Cloudflare agrega automáticamente los MX +
   SPF necesarios para `tronador.net.ar`. Aceptar.
3. **Email Workers** (sub-sección) → todavía no creamos rule, solo
   verificá que dice "Email Routing is enabled".

## Deploy del Worker

Desde la raíz del repo, en una terminal:

```bash
cd infra/cloudflare-email-worker
npm install
npx wrangler login          # abre browser, login con cuenta Cloudflare
npx wrangler secret put MAIL_INBOUND_SECRET
# ↑ Te pide el secret en stdin. Generar uno con:
#   openssl rand -base64 32   (anotar — el mismo va a Vercel)
npx wrangler deploy
```

`wrangler deploy` imprime:
```
Uploaded tronador-mail-inbound (X.XX sec)
Published tronador-mail-inbound (X.XX sec)
  https://tronador-mail-inbound.<tu-subdominio>.workers.dev
```

## Conectar Email Routing → Worker

1. Dashboard → `tronador.net.ar` → **Email** → **Email Workers** tab.
2. **Create routing rule** → "Send to a Worker".
3. Patrón: `replies+*@tronador.net.ar` (Cloudflare soporta wildcard
   sufijo para plus-addressing).
4. Worker destino: `tronador-mail-inbound` (el que acabás de deployar).
5. Activate.

> Cloudflare Email Routing usa el patrón `local-part+anything@domain`
> automáticamente. La regla `replies+*` matchea `replies+abc123@…`,
> `replies+xyz@…`, etc.

Opcional: agregar segunda rule **Catch-all** → "Send to email" → tu
Gmail. Cualquier mail a `nombre@tronador.net.ar` cae en tu inbox de
Gmail (sin necesidad de mailbox propio).

## Env vars Vercel (mismo secret)

En **Vercel → severo-tronador → Settings → Environment Variables**
(Production):

```
MAIL_INBOUND_SECRET=<el mismo secret que pusiste con wrangler secret put>
MAIL_REPLIES_ENABLED=1
MAIL_REPLIES_DOMAIN=tronador.net.ar
MAIL_REPLIES_LOCAL=replies
```

(Las vars `STALWART_*` y `MAIL_REPLIES_USER/PASSWORD` no aplican en
este modo. Si estaban setadas, borrarlas.)

Redeploy production.

## Verificación E2E

1. `/mail` muestra **modo Cloudflare** en el setup checklist.
2. Mandar campaña email de prueba con `RESEND_FROM=relevamiento@tronador.net.ar`
   y `MAIL_REPLIES_ENABLED=1`. El email lleva `Reply-To:
   replies+TOKEN@tronador.net.ar`.
3. Responder al mail desde tu Gmail.
4. Cloudflare matchea la rule → Worker se ejecuta → POST al webhook.
5. Worker logs: `npx wrangler tail` (en vivo).
6. Vercel logs: dashboard → Functions → `/api/webhooks/mail-in`.
7. `/respuestas` muestra la respuesta con `kind=email_reply` en <30s.

## Update del Worker

Cuando cambies `worker.ts`:

```bash
cd infra/cloudflare-email-worker
npx wrangler deploy
```

Versionado automático, rollback en dashboard si algo rompe.

## Costos

| Concepto | Costo |
|---|---|
| Cloudflare DNS + Email Routing | $0 |
| Cloudflare Workers (free tier: 100k req/día) | $0 |
| Vercel (Hobby plan vigente) | $0 |
| Resend (3k/mes free, suficiente para 100 contactos × 30 campañas) | $0 |
| **Total** | **$0/mes** |

## Trade-offs explícitos vs Stalwart

| Capacidad | Cloudflare+Resend | Stalwart Hetzner |
|---|---|---|
| Recibir replies de campañas | ✅ | ✅ |
| Auto-routing a `respuestas` | ✅ | ✅ |
| Webmail UI propio `/mail` | ❌ (sin IMAP) | ✅ |
| Casillas humanas `nombre@tronador` | Alias → forward a Gmail | Casilla real con IMAP/JMAP |
| Costo mensual | $0 | ~$5 |
| Lock-in | Cloudflare DNS | Ninguno |
| Operación | Cero ops | Backups, updates, monitoreo |

## Troubleshooting

| Síntoma | Fix |
|---|---|
| `wrangler login` no abre browser | `wrangler login --browser=false` y pegar el URL manualmente |
| Email no llega al worker | Verificar regla active en dashboard + DNS propagados (`dig MX tronador.net.ar` debe mostrar `route1.mx.cloudflare.net` etc) |
| Webhook devuelve 403 | Secret distinto entre Worker y Vercel. Re-correr `wrangler secret put` y/o resetear env var en Vercel |
| Respuesta no aparece en `/respuestas` | El reply-to del email NO usaba `replies+<token>@…`. Verificar `MAIL_REPLIES_ENABLED=1` en Vercel y redeploy |
| Worker error en tail | `npx wrangler tail` muestra logs en vivo |

## Reversa (rollback a Stalwart)

Si querés volver a Stalwart: desactivar la rule de Email Routing en
Cloudflare, setear `STALWART_*` + `MAIL_REPLIES_USER/PASSWORD` en
Vercel, reescribir MX a `mail.tronador.net.ar`. El código de Vercel
soporta ambos modos sin cambios.
