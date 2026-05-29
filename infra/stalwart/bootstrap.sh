#!/usr/bin/env bash
# Stalwart Mail Server bootstrap para tronador.net.ar (Plan 04 F1).
# Idempotente: re-correrlo no rompe nada, solo regenera la config.
#
# Uso:
#   sudo /opt/tronador/bootstrap.sh <FQDN> <ADMIN_EMAIL>
# Ejemplo:
#   sudo /opt/tronador/bootstrap.sh mail.tronador.net.ar admin@tronador.net.ar
#
# Qué hace:
#   1) Crea usuario stalwart + dir /opt/stalwart-mail.
#   2) Baja último binario Stalwart desde GitHub releases.
#   3) Genera config TOML mínima con TLS ACME (Let's Encrypt).
#   4) Crea systemd unit + lo arranca.
#   5) Imprime credenciales generadas (admin password + DKIM record para DNS).
#
# Requiere haber pasado el cloud-init.yaml previo (firewall + usuario tronador).

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: correr con sudo" >&2
  exit 1
fi

if [[ $# -lt 2 ]]; then
  echo "Uso: $0 <FQDN> <ADMIN_EMAIL>"
  echo "Ejemplo: $0 mail.tronador.net.ar admin@tronador.net.ar"
  exit 1
fi

FQDN="$1"
ADMIN_EMAIL="$2"
DOMAIN="$(echo "$ADMIN_EMAIL" | cut -d'@' -f2)"

INSTALL_DIR="/opt/stalwart-mail"
BIN_PATH="$INSTALL_DIR/bin/stalwart"
ETC_DIR="$INSTALL_DIR/etc"
DATA_DIR="$INSTALL_DIR/data"
LOG_DIR="$INSTALL_DIR/logs"
CRED_FILE="/root/stalwart-credentials.txt"

echo "▶ Bootstrap Stalwart para $FQDN (dominio $DOMAIN)"

# ── 1. Usuario stalwart + dirs ────────────────────────────────────────
if ! id stalwart >/dev/null 2>&1; then
  echo "▶ Creando usuario stalwart"
  useradd --system --home-dir "$INSTALL_DIR" --shell /usr/sbin/nologin stalwart
fi

mkdir -p "$INSTALL_DIR/bin" "$ETC_DIR" "$DATA_DIR" "$LOG_DIR"
chown -R stalwart:stalwart "$INSTALL_DIR"

# ── 2. Binario Stalwart (RocksDB build) ───────────────────────────────
if [[ ! -x "$BIN_PATH" ]]; then
  echo "▶ Descargando binario Stalwart"
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64)  ASSET="stalwart-x86_64-unknown-linux-gnu.tar.gz" ;;
    aarch64) ASSET="stalwart-aarch64-unknown-linux-gnu.tar.gz" ;;
    *) echo "ERROR: arquitectura no soportada: $ARCH" >&2; exit 1 ;;
  esac
  LATEST=$(curl -fsSL https://api.github.com/repos/stalwartlabs/stalwart/releases/latest \
    | jq -r --arg name "$ASSET" '.assets[] | select(.name==$name) | .browser_download_url')
  if [[ -z "$LATEST" || "$LATEST" == "null" ]]; then
    echo "ERROR: no se encontró asset $ASSET en la última release" >&2
    exit 1
  fi
  TMP=$(mktemp -d)
  curl -fsSL "$LATEST" -o "$TMP/stalwart.tgz"
  tar -xzf "$TMP/stalwart.tgz" -C "$TMP"
  install -m 0755 "$TMP/stalwart" "$BIN_PATH"
  rm -rf "$TMP"
fi
echo "▶ Binario: $($BIN_PATH --version)"

# ── 3. Credenciales generadas (idempotente) ───────────────────────────
if [[ ! -f "$CRED_FILE" ]]; then
  ADMIN_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-22)
  ADMIN_API_TOKEN=$(openssl rand -hex 32)
  REPLIES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-22)
  cat > "$CRED_FILE" <<EOF
# Credenciales Stalwart generadas en $(date -Iseconds)
# Guardar copia OFFLINE y borrar este archivo del server.
FQDN=$FQDN
DOMAIN=$DOMAIN
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD
ADMIN_API_TOKEN=$ADMIN_API_TOKEN
REPLIES_USER=replies@$DOMAIN
REPLIES_PASSWORD=$REPLIES_PASSWORD
EOF
  chmod 600 "$CRED_FILE"
fi
# shellcheck disable=SC1090
source "$CRED_FILE"

# ── 4. Config TOML ────────────────────────────────────────────────────
echo "▶ Generando config en $ETC_DIR/config.toml"

cat > "$ETC_DIR/config.toml" <<EOF
# Stalwart Mail Server config — generado por bootstrap.sh
# Re-correr el bootstrap regenera este archivo. Tweaks manuales se pierden;
# editar este script si querés persistirlos.

[server]
hostname = "$FQDN"

[server.listener.smtp]
bind = ["[::]:25"]
protocol = "smtp"

[server.listener.submission]
bind = ["[::]:587"]
protocol = "smtp"
tls.implicit = false

[server.listener.smtps]
bind = ["[::]:465"]
protocol = "smtp"
tls.implicit = true

[server.listener.imap]
bind = ["[::]:143"]
protocol = "imap"

[server.listener.imaps]
bind = ["[::]:993"]
protocol = "imap"
tls.implicit = true

[server.listener.https]
bind = ["[::]:443"]
protocol = "http"
tls.implicit = true

[server.listener.http]
bind = ["[::]:80"]
protocol = "http"

[server.listener.management]
bind = ["[::]:8080"]
protocol = "http"

[server.tls]
enable = true
implicit = false
certificate = "default"

[certificate.default]
cert = "%{file:$DATA_DIR/tls/$FQDN.crt}%"
private-key = "%{file:$DATA_DIR/tls/$FQDN.key}%"
default = true

[acme."letsencrypt"]
directory = "https://acme-v02.api.letsencrypt.org/directory"
challenge = "tls-alpn-01"
contact = ["mailto:$ADMIN_EMAIL"]
renew-before = "30d"
domains = ["$FQDN"]

[storage]
data = "rocksdb"
fts = "rocksdb"
blob = "rocksdb"
lookup = "rocksdb"
directory = "internal"

[store."rocksdb"]
type = "rocksdb"
path = "$DATA_DIR/rocks"
compression = "lz4"

[directory."internal"]
type = "internal"
store = "rocksdb"

[authentication.fallback-admin]
user = "admin"
secret = "$ADMIN_PASSWORD"

[jmap]
session.user.identifier = "username"

[oauth]
enable = false

[management.api]
enable = true
# El token Bearer protege el endpoint admin /api/principal usado por
# Tronador (lib/mailbox/provision.ts).
auth.token = "$ADMIN_API_TOKEN"

[logger]
level = "info"
path = "$LOG_DIR"
EOF
chown stalwart:stalwart "$ETC_DIR/config.toml"
chmod 640 "$ETC_DIR/config.toml"

# ── 5. systemd unit ───────────────────────────────────────────────────
echo "▶ Instalando systemd unit"
cat > /etc/systemd/system/stalwart-mail.service <<EOF
[Unit]
Description=Stalwart Mail Server
After=network.target

[Service]
Type=simple
User=stalwart
Group=stalwart
ExecStart=$BIN_PATH --config $ETC_DIR/config.toml
Restart=on-failure
RestartSec=5
LimitNOFILE=65536
# Necesario para bind a :25, :80, :443 sin root.
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$DATA_DIR $LOG_DIR
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable stalwart-mail
systemctl restart stalwart-mail

sleep 3
if ! systemctl is-active --quiet stalwart-mail; then
  echo "ERROR: stalwart-mail no arrancó. journalctl -u stalwart-mail" >&2
  journalctl -u stalwart-mail -n 30 --no-pager
  exit 1
fi

# ── 6. Output final ───────────────────────────────────────────────────
cat <<EOF

══════════════════════════════════════════════════════════
✔ Stalwart Mail Server arriba en $FQDN
══════════════════════════════════════════════════════════

Credenciales en: $CRED_FILE  (copiar offline + borrar después)

Próximos pasos:
  1) DNS — agregar al registrar de $DOMAIN:
       MX     $DOMAIN.                  10  $FQDN.
       A      $FQDN.                        $(curl -fsSL https://ipv4.icanhazip.com 2>/dev/null || echo "<IP-del-VPS>")
       TXT    $DOMAIN.                      "v=spf1 mx ~all"
       TXT    _dmarc.$DOMAIN.               "v=DMARC1; p=quarantine; rua=mailto:$ADMIN_EMAIL"
     DKIM se genera tras el primer envío. Ver:
       curl -H "Authorization: Bearer $ADMIN_API_TOKEN" \\
         http://$FQDN:8080/api/dkim

  2) Provisionar mailbox replies@:
       sudo /opt/tronador/provision-replies.sh

  3) Setear en Vercel (production):
       STALWART_URL=https://$FQDN
       STALWART_ADMIN_TOKEN=$ADMIN_API_TOKEN
       MAIL_REPLIES_ENABLED=1
       MAIL_REPLIES_DOMAIN=$DOMAIN
       MAIL_REPLIES_USER=replies@$DOMAIN
       MAIL_REPLIES_PASSWORD=$REPLIES_PASSWORD

  4) Validar logs:
       journalctl -u stalwart-mail -f

EOF
