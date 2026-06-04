# Stalwart en Oracle Cloud Always-Free — runbook ($0)

Levanta el mail server `@tronador.net.ar` **gratis** en Oracle Cloud
(Always-Free), reutilizando los scripts de `infra/stalwart/`. Resultado:
webmail real en la app (crear/enviar/recibir individuales vía JMAP) +
recepción de replies. El **envío masivo sigue por Resend**.

> Alternativa al VPS pago de Hetzner: mismo Stalwart, host gratis. La VM
> Always-Free **Ampere A1 es ARM64** — `bootstrap.sh` ya descarga el binario
> `aarch64`, no hay que tocar nada.

---

## ⚠️ Limitaciones de Oracle que definen el diseño (leer primero)

1. **Puerto 25 SALIENTE bloqueado** en cuentas creadas después del 2021-06-23
   (todas las free). Stalwart **recibe** bien (inbound 25, se abre en la
   Security List) pero **no puede entregar** mail directo a otros servidores.
   → **Solución: relay/smarthost por 587** (Resend SMTP, Brevo o SMTP2GO).
   Stalwart maneja casillas + JMAP + webmail + inbound; el relay hace la
   entrega saliente. (Ver Paso 6.)
2. **Ampere A1 = ARM64.** Elegí imagen ARM (Ubuntu 22.04 / Debian 12 aarch64).
3. **Always-Free real:** 4 OCPU + 24 GB ARM repartibles + 200 GB block +
   2 IP públicas. Pedís tarjeta solo para verificación; el uso Always-Free es
   **$0** (no se cobra salvo que pases a "Pay As You Go" a propósito).

---

## Paso 0 — Prereqs

- Dominio `tronador.net.ar` con acceso al DNS (registrar o Cloudflare como
  DNS-only).
- Clave SSH (`cat ~/.ssh/id_ed25519.pub`; si no tenés: `ssh-keygen -t ed25519`).
- Una cuenta de relay para outbound (recomendado **Resend** — ya lo usás para
  masivo; sirve su SMTP). Alternativas: Brevo (300/día free), SMTP2GO.

## Paso 1 — Crear cuenta Oracle Cloud (dónde y cómo)

1. Ir a **https://www.oracle.com/cloud/free/** → **Start for free**.
2. Email + país (**Argentina**) + verificación por SMS.
3. **Home Region**: elegí una cercana y con capacidad Ampere — **`sa-saopaulo-1`
   (São Paulo)** o **`us-east-ashburn-1`**. ⚠️ La región se fija **para siempre**
   en el signup; elegí bien (Ampere a veces sin stock → reintentar / otra región).
4. Tarjeta de crédito para verificar identidad (autorización temporal ~$1 que
   se reembolsa; Always-Free no cobra).
5. Confirmar → entrás a la **OCI Console** (cloud.oracle.com).

## Paso 2 — Crear la VM Always-Free (Ampere ARM64)

Console → **☰ → Compute → Instances → Create instance**:
- **Name:** `tronador-mail`.
- **Image & shape → Edit:**
  - Image: **Canonical Ubuntu 22.04** (o Debian 12), **aarch64**.
  - Shape: **Ampere → VM.Standard.A1.Flex** → 1 OCPU / 6 GB (alcanza; podés
    4/24). Estos están marcados **"Always Free-eligible"**.
- **Networking:** crea una VCN nueva (default) + **Assign a public IPv4**.
- **SSH keys:** pegá tu pubkey.
- **Boot volume:** default (47 GB, free).
- **Create** → esperá ~1 min → anotá la **IP pública**.

> Si "Out of host capacity" en Ampere: reintentar cada tanto, o probar otra
> AD/región. Es el único cuello del free tier.

## Paso 3 — Abrir puertos (DOS lugares)

**(a) Security List de la VCN** (firewall de red de Oracle):
Console → Networking → Virtual Cloud Networks → tu VCN → Subnet → Security List
→ **Add Ingress Rules** (Source `0.0.0.0/0`, TCP) para los puertos:
`25, 80, 443, 143, 993, 465, 587`.

**(b) Firewall del SO** (las imágenes Oracle traen iptables cerrado salvo 22):
```bash
ssh ubuntu@<IP>
sudo bash -c 'for p in 25 80 443 143 993 465 587; do \
  iptables -I INPUT 6 -p tcp --dport $p -j ACCEPT; done; \
  netfilter-persistent save'
```
(En Debian el usuario SSH puede ser `admin` o `debian`; en Ubuntu Oracle es
`ubuntu`.)

## Paso 4 — PTR / reverse DNS (deliverability)

Console → Instance → VNIC → **Edit reverse DNS** del IP público →
`mail.tronador.net.ar`. (Con relay saliente importa menos, pero ayuda.)

## Paso 5 — Instalar Stalwart (reusa los scripts del repo)

Desde tu laptop, parado en el repo:
```bash
scp infra/stalwart/{bootstrap.sh,provision-replies.sh,dns-records.sh} \
  ubuntu@<IP>:/tmp/
ssh ubuntu@<IP> "sudo mkdir -p /opt/tronador && sudo mv /tmp/*.sh /opt/tronador/ && sudo chmod +x /opt/tronador/*.sh"
ssh ubuntu@<IP>
sudo /opt/tronador/bootstrap.sh mail.tronador.net.ar admin@tronador.net.ar
```
El script detecta `aarch64`, baja el binario ARM, genera config TLS ACME +
passwords (admin/replies/API token) en `/root/stalwart-credentials.txt`,
levanta el systemd unit. **Copiá las credenciales offline.**

## Paso 6 — Configurar el relay saliente (por el bloqueo del 25)

Stalwart debe entregar el saliente vía un smarthost en 587 (no por 25 directo).
En la **admin UI** de Stalwart (`https://mail.tronador.net.ar` → Settings →
SMTP → Outbound / Relay host) o en el TOML, configurá una ruta remota con auth.
Ejemplo con **Resend SMTP**:
- Host: `smtp.resend.com`  Puerto: `587`  TLS: STARTTLS
- User: `resend`  Pass: tu `RESEND_API_KEY`
- Routea **todo el outbound** por ese host.

(Brevo: `smtp-relay.brevo.com:587`. SMTP2GO: `mail.smtp2go.com:587`.)
Verificá el dominio `tronador.net.ar` en el relay (SPF/DKIM del relay) para no
caer en spam.

## Paso 7 — DNS

En el server: `sudo /opt/tronador/dns-records.sh` → imprime los registros
exactos (A, MX, SPF, DMARC, DKIM). Cargalos en el DNS del dominio:
- `A    mail.tronador.net.ar → <IP Oracle>`
- `MX   tronador.net.ar → 10 mail.tronador.net.ar`
- `TXT  tronador.net.ar → "v=spf1 mx include:_spf.resend.com ~all"` (sumá el
  include del relay que uses)
- `TXT  _dmarc.tronador.net.ar → "v=DMARC1; p=quarantine; rua=mailto:admin@tronador.net.ar"`
- `TXT  <selector>._domainkey… → <DKIM de Stalwart>` (del script)

> Si el DNS lo maneja Cloudflare: cargá estos registros **DNS-only (nube gris,
> sin proxy)**. El proxy naranja NO aplica a MX/mail.

## Paso 8 — Provisionar casillas + replies

```bash
sudo /opt/tronador/provision-replies.sh   # crea la casilla replies@ para el cron
```
Casillas de equipo (`nombre@tronador.net.ar`) se crean desde la app
(`/mail/setup` → provisioná) una vez wired, o por la admin API de Stalwart.

## Paso 9 — Conectar la app (Vercel)

En Vercel → Project → Settings → Environment Variables (Production):
```
STALWART_URL=https://mail.tronador.net.ar
STALWART_ADMIN_TOKEN=<ADMIN_API_TOKEN de las credenciales>
MAIL_REPLIES_ENABLED=1
MAIL_REPLIES_DOMAIN=tronador.net.ar
MAIL_REPLIES_LOCAL=replies
MAIL_REPLIES_USER=replies@tronador.net.ar
MAIL_REPLIES_PASSWORD=<REPLIES_PASSWORD de las credenciales>
```
Redeploy. La app **autodetecta modo Stalwart** (`isLiveMode()`): el webmail
deja de ser mock — `/mail` lee/escribe real, el composer envía vía JMAP, y el
cron `mail-sync` (cada 10 min, GitHub Actions) levanta los replies → los rutea
a `respuestas`. El **tracking** (apertura/clicks) ya quedó activo desde el
PR #16.

## Paso 10 — Cerrar Cloudflare (¡recién ahora!)

Solo cuando Stalwart **recibe** OK (Paso 11 verde):
1. Cambiá el **MX** del dominio: de `*.mx.cloudflare.net` → `mail.tronador.net.ar`
   (ya hecho en Paso 7 si migraste el DNS).
2. Cloudflare dashboard → **Email → Email Routing → Disable** (apaga el
   ruteo + el Worker `cloudflare-email-worker`).
3. Borrá (o dejá sin uso) el env `MAIL_INBOUND_SECRET` en Vercel — el webhook
   `/api/webhooks/mail-in` queda inactivo; ahora el inbound entra por Stalwart.

> ⚠️ No apagues Cloudflare **antes** de tener Stalwart recibiendo: quedás sin
> inbound. Orden = Stalwart arriba → verificar recepción → recién apagar CF.

## Paso 11 — Verificación

- **Recepción:** mandá un mail desde Gmail a `admin@tronador.net.ar` → debe
  aparecer en la admin UI de Stalwart / en `/mail` de la app.
- **Envío:** desde `/mail/compose` mandá a tu Gmail → debe llegar (vía relay).
- **Reputación:** mandá a **https://www.mail-tester.com** y apuntá a ≥ 9/10
  (SPF+DKIM+DMARC+PTR ok).
- **Replies de campaña:** una campaña email con `{{encuesta_url}}` → respondé
  el mail → el cron `mail-sync` lo archiva como respuesta de la campaña.
- **Tracking:** abrí el mail y clickeá el link → `/campanas/[id]` muestra
  aperturas/clicks.

## Costos / recap

| Recurso | Oracle Always-Free |
|---|---|
| VM Ampere A1 (1-4 OCPU / 6-24 GB) | $0 |
| 200 GB block storage | $0 |
| IP pública + tráfico (10 TB/mes out) | $0 |
| Relay saliente (Resend free 3k/mes) | $0 |
| **Total** | **$0/mes** |

El único trabajo recurrente: renovar TLS (automático vía ACME) y vigilar
reputación. Backups: snapshot del boot volume (free dentro de la cuota).
