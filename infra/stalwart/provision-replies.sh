#!/usr/bin/env bash
# Provisiona el mailbox replies@<dominio> en Stalwart vía Admin API.
# Idempotente: si ya existe con esa dirección, lo deja como está.
#
# Uso:
#   sudo /opt/tronador/provision-replies.sh
#
# Lee credenciales generadas por bootstrap.sh en /root/stalwart-credentials.txt.

set -euo pipefail

CRED_FILE="/root/stalwart-credentials.txt"
if [[ ! -f "$CRED_FILE" ]]; then
  echo "ERROR: $CRED_FILE no encontrado. Correr bootstrap.sh primero." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$CRED_FILE"

ENDPOINT="http://127.0.0.1:8080/api/principal"

echo "▶ Creando principal replies@$DOMAIN"

PAYLOAD=$(cat <<EOF
{
  "type": "individual",
  "name": "replies",
  "emails": ["replies@$DOMAIN"],
  "secrets": ["$REPLIES_PASSWORD"],
  "quota": 5000000000
}
EOF
)

HTTP_CODE=$(curl -sS -o /tmp/stalwart-prov.json -w "%{http_code}" \
  -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "$ENDPOINT" \
  -d "$PAYLOAD")

case "$HTTP_CODE" in
  200|201)
    echo "✔ Mailbox creado."
    ;;
  409)
    echo "↺ Mailbox ya existía (409). OK."
    ;;
  *)
    echo "ERROR: Stalwart respondió $HTTP_CODE" >&2
    cat /tmp/stalwart-prov.json >&2
    exit 1
    ;;
esac

cat <<EOF

Credenciales del mailbox replies (para Vercel):
  MAIL_REPLIES_USER=replies@$DOMAIN
  MAIL_REPLIES_PASSWORD=$REPLIES_PASSWORD

Test JMAP con curl:
  curl -u replies@$DOMAIN:$REPLIES_PASSWORD https://$FQDN/.well-known/jmap

EOF
