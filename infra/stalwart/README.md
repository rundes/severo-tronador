# Stalwart Mail Server — bootstrap Hetzner

Setup productivo del mailbox `@tronador.net.ar` (Plan 04 F1).

## Prereqs

- Cuenta Hetzner Cloud + clave SSH cargada.
- Dominio `tronador.net.ar` con acceso al registrar para cargar DNS.
- Variables a inyectar después en Vercel.

## Paso a paso

### 1. Crear VPS

- Dashboard Hetzner → **Add Server**.
- Imagen: **Debian 12**.
- Tipo: **CX22** (4€/mes — 2 vCPU, 4GB RAM, 40GB SSD). Suficiente para
  decenas de miles de mensajes/día.
- Ubicación: **Falkenstein (FSN1)** o **Nuremberg (NBG1)** (latencia OK
  para AR, mejor uptime que ASH).
- En **Cloud config** pegar el contenido de `cloud-init.yaml`,
  reemplazando `AAAA_REEMPLAZAR_POR_TU_CLAVE_PUBLICA` por tu pubkey SSH
  real (`cat ~/.ssh/id_ed25519.pub`).
- Asignar una **IP IPv4** dedicada (default).
- Crear → anotar la IP pública.

### 2. Subir scripts al VPS

Desde tu laptop, parado en el repo:

```bash
scp infra/stalwart/{bootstrap.sh,provision-replies.sh,dns-records.sh} \
  tronador@<IP>:/opt/tronador/
ssh tronador@<IP> "chmod +x /opt/tronador/*.sh"
```

### 3. Bootstrap Stalwart

```bash
ssh tronador@<IP>
sudo /opt/tronador/bootstrap.sh mail.tronador.net.ar admin@tronador.net.ar
```

El script:
- Crea usuario `stalwart` + dirs en `/opt/stalwart-mail`.
- Descarga último binario Stalwart desde GitHub releases.
- Genera config TOML mínima con TLS ACME (Let's Encrypt).
- Genera passwords aleatorios (admin + replies + API token).
- Levanta systemd unit + lo arranca.
- Imprime credenciales generadas y próximos pasos.

Credenciales quedan en `/root/stalwart-credentials.txt`. **Copialas
offline y borrá el archivo del server después.**

### 4. Cargar DNS

```bash
sudo /opt/tronador/dns-records.sh
```

Imprime los registros A/MX/SPF/DMARC/DKIM exactos. Pegalos en el
registrar del dominio. Esperar ~15min de propagación.

Verificar:

```bash
dig +short MX tronador.net.ar
dig +short TXT tronador.net.ar
```

### 5. Provisionar mailbox de replies

```bash
sudo /opt/tronador/provision-replies.sh
```

Crea la cuenta `replies@tronador.net.ar` con la password generada en el
paso 3. Tronador la usa para auto-rutear respuestas de campañas vía
plus-addressing (`replies+<token>@…`).

### 6. Setear env vars en Vercel

En **Vercel → Project → Settings → Environment Variables** (Production):

```
STALWART_URL=https://mail.tronador.net.ar
STALWART_ADMIN_TOKEN=<ADMIN_API_TOKEN del paso 3>
MAIL_REPLIES_ENABLED=1
MAIL_REPLIES_DOMAIN=tronador.net.ar
MAIL_REPLIES_USER=replies@tronador.net.ar
MAIL_REPLIES_PASSWORD=<REPLIES_PASSWORD del paso 3>
```

Re-deploy production para que tomen efecto.

### 7. Verificar end-to-end

- `/mail` en Tronador → checklist debe ser **6/6 verde**.
- Click "Crear mi casilla" → provisiona `<vos>@tronador.net.ar`.
- Mandar campaña email a 1 contacto de prueba.
- Contacto responde al email.
- Esperar ≤10 min (cron de `mail-sync`).
- `/respuestas` muestra la respuesta con `kind=email_reply`.

## Operación

### Ver logs

```bash
journalctl -u stalwart-mail -f
```

### Actualizar Stalwart

```bash
sudo systemctl stop stalwart-mail
sudo rm /opt/stalwart-mail/bin/stalwart
sudo /opt/tronador/bootstrap.sh mail.tronador.net.ar admin@tronador.net.ar
# El bootstrap es idempotente: detecta config existente y solo baja
# binario + reinicia.
```

### Backup datos

```bash
sudo tar -czf stalwart-backup-$(date +%F).tgz /opt/stalwart-mail/data
scp tronador@<IP>:~/stalwart-backup-*.tgz ./
```

RocksDB tolera snapshots en caliente. Para backup atómico parar el
servicio 2-3 segundos:

```bash
sudo systemctl stop stalwart-mail
sudo tar -czf /tmp/stalwart-backup-$(date +%F).tgz /opt/stalwart-mail/data
sudo systemctl start stalwart-mail
```

### Cambiar password admin

Editar `/opt/stalwart-mail/etc/config.toml` (sección
`[authentication.fallback-admin]`) y reiniciar:

```bash
sudo systemctl restart stalwart-mail
```

## Costos

- Hetzner CX22: **€4.51/mes** (~USD 5).
- DNS: incluido en el registro del dominio.
- Total: ~USD 60/año para mail self-hosted ilimitado.

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| `systemctl status` → failed | Puerto 25 ocupado | `sudo lsof -i :25` y kill |
| ACME TLS no se emite | DNS no propagado | Esperar 15min, re-verificar `dig` |
| `permission denied (publickey)` | Pubkey mal cargada | Re-pegar `cloud-init.yaml` con la pubkey real |
| Mail-sync no rutea | `MAIL_REPLIES_ENABLED` ausente | Setear en Vercel + redeploy |
| Spam folder | SPF/DKIM/DMARC missing | `dns-records.sh` + esperar propagación |

## Seguridad

- `/root/stalwart-credentials.txt` contiene secretos en plano. Tras
  copiarlos offline, borrar del server: `sudo shred -u /root/stalwart-credentials.txt`.
- El puerto 8080 (admin API) está abierto al mundo por simplicidad.
  Restringir a IPs de Vercel cuando esté listo: `sudo ufw delete allow
  8080/tcp && sudo ufw allow from <IP_VERCEL> to any port 8080`.
- `fail2ban` está instalado pero requiere una regla específica para
  Stalwart si querés bloquear bruteforce SMTP.
