# Plan 04 — Mailbox `@tronador.net.ar`

> Plataforma propia de correo: cada usuario del Centro recibe una casilla
> `nombre@tronador.net.ar` y puede enviar/recibir correos individuales
> directamente desde Tronador, además del envío masivo via Resend.

## Por qué

- Identidad consistente: el equipo del Centro responde y escribe desde
  el mismo dominio que firma los relevamientos.
- Sin terceros leyendo el correo: Resend es para outreach masivo, no
  para conversaciones individuales con la ciudadanía. La info sensible
  vive en infraestructura propia.
- Soberanía técnica: stack open source, datos en VPS controlado.

## Stack elegido — Stalwart Mail Server

Después de comparar mailcow / WildDuck+Haraka / Postfix+Dovecot,
elegimos **Stalwart**:

- **Stalwart** (https://stalw.art): Rust, single-binary, IMAP / POP3 /
  SMTP / JMAP en un solo proceso. Storage SQLite o PostgreSQL. Admin
  HTTP API JSON. Activamente mantenido, BSL-licensed con free
  self-hosted.
- vs mailcow: stack Docker con 12 contenedores. Funciona pero pesado.
- vs Postfix+Dovecot+SOGo: 3 servicios separados con sysadmin
  intensivo.
- vs WildDuck+Haraka: Node, MongoDB. Bien diseñado pero más piezas.

**Single binary + JMAP first-class** gana.

## Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│  tronador.net.ar (Vercel · Next.js)                     │
│  ┌────────────────────────────────────────────────┐     │
│  │  /mail  · webmail UI                           │     │
│  │  · lista de mensajes (JMAP getMessages)        │     │
│  │  · composer (JMAP setEmail submit)             │     │
│  │  · provisioning de cuentas (Stalwart Admin API)│     │
│  └────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
                          │ JMAP (HTTPS)
                          ▼
┌─────────────────────────────────────────────────────────┐
│  mail.tronador.net.ar (Hetzner CX22 / DO basic VPS)     │
│  · Stalwart Mail Server                                 │
│  · Storage: PostgreSQL (compartido con Supabase external│
│    o instancia local)                                   │
│  · TLS: certbot / acme via stalwart built-in            │
│  · IMAP 993 · SMTP 587/465 · JMAP 443                   │
└─────────────────────────────────────────────────────────┘
```

## DNS (en Vercel domains)

```
A     mail.tronador.net.ar     → <VPS IP>
MX    tronador.net.ar          → mail.tronador.net.ar  prio 10
TXT   tronador.net.ar          "v=spf1 mx ~all"
TXT   default._domainkey       "v=DKIM1; k=rsa; p=…"   (Stalwart genera)
TXT   _dmarc                   "v=DMARC1; p=quarantine; rua=mailto:admin@tronador.net.ar"
```

## Fases de entrega

### F1 — Provisionar mailbox `admin@tronador.net.ar`

Operativo (no código):
1. Levantar Hetzner CX22 (4€/mes) con Debian 12.
2. Instalar Stalwart: `bash <(curl -fsSL https://get.stalw.art/install.sh)`.
3. Configurar dominio + admin con CLI: `stalwart-cli domain create
   tronador.net.ar` + `stalwart-cli account create admin@tronador.net.ar`.
4. Apuntar DNS records arriba.
5. Probar IMAP desde Thunderbird con `admin@tronador.net.ar`.

### F2 — JMAP client en Tronador

Código:
- `lib/mailbox.ts`: cliente JMAP (`stalwart-jmap-client` o fetch directo
  a `/jmap/api`). Métodos: `listMailboxes`, `listMessages`,
  `getMessage`, `sendEmail`, `markRead`.
- `lib/mailbox-auth.ts`: per-user JMAP credentials. Cada usuario del
  panel Tronador (Google OAuth con email allowlist) → maileado con
  `<userid>@tronador.net.ar`. Password generado al provisionar,
  guardado encriptado en `mailbox_credentials` (AES-GCM con
  CONFIG_MASTER_KEY).
- Tabla `mailbox_credentials(user_email, mailbox_address,
  jmap_password_encrypted, created_at)`.

### F3 — Provisioning UI

Página `/mail/setup`:
- Si user del panel no tiene mailbox: botón "Provisionar mi casilla
  `<nombre>@tronador.net.ar`".
- Server action llama Stalwart Admin API (POST `/admin/account` con
  api token guardado en env como `STALWART_ADMIN_TOKEN`).
- Provisiona + guarda credenciales en `mailbox_credentials`.

### F4 — Webmail MVP

Página `/mail`:
- Sidebar con folders (INBOX, Sent, Drafts, Trash).
- Lista de mensajes paginada.
- Vista de mensaje individual.
- Composer simple (To, Subject, Body texto + attachments).

Skip de scope MVP:
- Filtros / sieve scripts
- Etiquetas custom
- Notificaciones push

### F5 — Auto-routing de respuestas a campañas

Listener de inbox que detecta replies a mails enviados desde
campañas Resend (header `In-Reply-To: <messageId@tronador.net.ar>`) y
los archiva como respuestas cualitativas en la campaña correspondiente.

---

## Costo operativo

- Hetzner CX22: 4€/mes (~$4.50)
- Backup: 1€/mes
- DNS: ya tenemos
- Stalwart self-hosted free
- Total: ~$5.50/mes

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| IP del VPS en blacklist | Warm-up gradual, configurar SPF/DKIM/DMARC correcto, monitorear con mxtoolbox |
| Mailbox del Centro recibe spam | Stalwart trae rspamd integrado, filtros default |
| Downtime del VPS | Hetzner SLA 99.9%, monitorear con uptimerobot |
| Storage local pierde mails | Backup nocturno a S3-compatible (Storj o Backblaze) |
| Email comprometido al delegar a JMAP en cliente | Encriptación at-rest de passwords con AES-GCM (ya tenemos CONFIG_MASTER_KEY) |

## Estado actual

Plan documentado. F1 requiere acceso a Hetzner/DO + DNS Vercel. F2+
puede arrancar a la par una vez F1 listo.

Mientras tanto: stub UI en `/mail` con placeholder "Tronador Mail
pendiente deployment (ver plan 04)" para no romper la navegación
cuando aparezca el link en el sidebar.
