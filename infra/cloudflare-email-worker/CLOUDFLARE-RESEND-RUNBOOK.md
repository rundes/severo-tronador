# Mail @tronador.net.ar — Cloudflare (recibir) + Resend (enviar) — runbook ($0)

Activa el mail de la app **sin servidor/VPS**: recibís por Cloudflare Email
Routing → webhook → bandeja in-app; enviás (individual + masivo) por Resend
desde `@tronador.net.ar`, con tracking de apertura/clicks. **$0/mes.**

> El código ya está (modo `resend` autodetectado). Esto es **config**: Resend,
> Cloudflare y env vars en Vercel. Alternativa al webmail JMAP full (Stalwart),
> que está en `infra/stalwart/ORACLE-RUNBOOK.md`.

---

## Arquitectura

```
Enviar  →  app /mail/compose + campañas  →  Resend (from: nombre@tronador.net.ar)
Recibir →  MX Cloudflare  →  Email Worker  →  POST /api/webhooks/mail-in (HMAC)
                                              ├─ reply de campaña → respuestas
                                              └─ todo → bandeja in-app (inbound_emails)
Tracking → pixel /api/track/o + redirect /api/track/c (por destinatario)
```

---

## Paso 0 — Prereqs

- Dominio `tronador.net.ar` con **DNS en Cloudflare** (nameservers apuntando a
  Cloudflare). Si está en otro DNS, primero pasalo a Cloudflare (Add site →
  cambiar nameservers en el registrar).
- `wrangler` instalado (`npm i -g wrangler`) + login (`wrangler login`).
- Acceso a las env vars de Vercel del proyecto.

## Paso 1 — Resend (envío)

1. Crear cuenta en **https://resend.com**.
2. **Domains → Add Domain** → `tronador.net.ar`. Resend te da registros
   **SPF + DKIM + (MX de bounce opcional)**. Anotalos.
3. **API key** (Settings → API Keys) → la usás como `RESEND_API_KEY`.
4. Verificá el dominio (cuando el DNS propague, Resend lo marca "Verified").

## Paso 2 — Cloudflare Email Routing (recepción)

1. Dashboard Cloudflare → dominio → **Email → Email Routing → Enable**.
2. Cloudflare **agrega solo** los MX (no los cargues a mano):
   ```
   MX  tronador.net.ar  13  route1.mx.cloudflare.net
   MX  tronador.net.ar  37  route2.mx.cloudflare.net
   MX  tronador.net.ar  61  route3.mx.cloudflare.net
   ```
   (+ unos MX en `cf-bounce.tronador.net.ar`, automáticos — dejarlos.)
3. **Routing rules** → catch-all (o regla `*@tronador.net.ar`) → **Action:
   Send to a Worker** → el worker `tronador-email-inbound` (Paso 3).
   - Para que entren los replies de campaña: que la regla cubra
     `replies+*@tronador.net.ar` (el catch-all ya lo incluye).

## Paso 3 — Deploy del Email Worker

El worker firma el mail entrante (HMAC) y lo postea al webhook de la app.
Fuente: `infra/cloudflare-email-worker/`.

```bash
cd infra/cloudflare-email-worker
# 1. Editar wrangler.toml: VERCEL_WEBHOOK_URL = "https://<tu-app>.vercel.app/api/webhooks/mail-in"
# 2. Setear el secreto compartido (mismo valor que pondrás en Vercel):
wrangler secret put MAIL_INBOUND_SECRET     # pegá un secreto fuerte (openssl rand -hex 32)
# 3. Deploy:
wrangler deploy
```
En Cloudflare → Email Routing → la regla del Paso 2 apuntá al worker recién
deployado.

## Paso 4 — DNS: SPF / DKIM / DMARC

⚠️ **Un solo registro SPF.** Como recibís por Cloudflare y enviás por Resend,
combiná ambos includes:
```
TXT  tronador.net.ar   "v=spf1 include:_spf.mx.cloudflare.net include:_spf.resend.com ~all"
TXT  resend._domainkey.tronador.net.ar   <valor DKIM que da Resend>
TXT  _dmarc.tronador.net.ar   "v=DMARC1; p=quarantine; rua=mailto:admin@tronador.net.ar"
```
(Si Cloudflare ya creó un SPF solo con su include, editalo y agregale
`include:_spf.resend.com` — no agregues un 2º TXT SPF.)

## Paso 5 — Env vars en Vercel

Project → Settings → Environment Variables (Production) → **Redeploy** después:
```
RESEND_API_KEY=<key de Resend>
RESEND_FROM=relevamiento@tronador.net.ar   # remitente por defecto del masivo
MAIL_INBOUND_SECRET=<el MISMO que pusiste en el worker>
MAIL_REPLIES_ENABLED=1
MAIL_REPLIES_DOMAIN=tronador.net.ar
MAIL_REPLIES_LOCAL=replies
```
Con esto la app autodetecta **modo `resend`** (banner verde en `/mail`).

## Paso 6 — Provisionar tu casilla

En la app: **/mail → "Crear mi casilla"** → registra `tu-usuario@tronador.net.ar`
como remitente (el `from:` de Resend para tus envíos individuales).

## Paso 7 — Verificación

- **Enviar individual:** `/mail/compose` → a tu Gmail → debe llegar (revisá que
  no caiga en spam; con SPF+DKIM de ResID OK).
- **Enviar masivo:** crear campaña email con `{{encuesta_url}}` → sale por Resend.
- **Recibir:** mandá un mail a `admin@tronador.net.ar` (o respondé una campaña)
  → en ~segundos aparece en **/mail** (bandeja in-app). Reply de campaña además
  cae en **/respuestas**.
- **Tracking:** abrí el mail + clickeá el link → `/campanas/[id]` muestra
  aperturas/clicks.
- **Reputación:** test en https://www.mail-tester.com (apuntá ≥ 9/10).

## Límites / costos

| Recurso | Free |
|---|---|
| Cloudflare Email Routing (recibir) | $0 ilimitado |
| Cloudflare Worker | $0 (100k req/día) |
| Resend (enviar) | 3.000/mes, 100/día |
| Bandeja in-app (Supabase) | dentro de tu plan |
| **Total** | **$0/mes** |

> Si superás 3k envíos/mes, subí el plan de Resend (no cambia el código).
> No hay casillas IMAP/JMAP reales (eso es Stalwart): la "bandeja" son los
> entrantes ruteados por Cloudflare, leídos en la app.

## Apagar (rollback)

- Quitar `RESEND_API_KEY` de Vercel → vuelve a mock (o a Stalwart si seteás esas).
- Cloudflare → Email Routing → Disable (saca los MX).
