#!/usr/bin/env bash
# Imprime los registros DNS exactos que hay que cargar en el registrar
# del dominio para que el mail server quede operativo. DKIM se extrae
# del propio Stalwart vía su Admin API (se genera la primera vez que
# corre).
#
# Uso:
#   sudo /opt/tronador/dns-records.sh

set -euo pipefail

CRED_FILE="/root/stalwart-credentials.txt"
if [[ ! -f "$CRED_FILE" ]]; then
  echo "ERROR: $CRED_FILE no encontrado." >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$CRED_FILE"

IP=$(curl -fsSL https://ipv4.icanhazip.com)
DKIM=$(curl -fsSL -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  "http://127.0.0.1:8080/api/dkim" 2>/dev/null || echo '')

cat <<EOF
══════════════════════════════════════════════════════════
DNS records para $DOMAIN — agregar en el registrar
══════════════════════════════════════════════════════════

A         $FQDN.                  $IP
MX        $DOMAIN.                10  $FQDN.
TXT       $DOMAIN.                "v=spf1 mx ~all"
TXT       _dmarc.$DOMAIN.         "v=DMARC1; p=quarantine; rua=mailto:$ADMIN_EMAIL"

EOF

if [[ -n "$DKIM" ]]; then
  echo "DKIM (del admin api):"
  echo "$DKIM" | jq -r '.[] | "TXT       \(.selector)._domainkey.\(.domain).  \"\(.value)\""' 2>/dev/null || echo "$DKIM"
else
  echo "DKIM aún no inicializado en Stalwart. Después del primer arranque:"
  echo "  curl -H 'Authorization: Bearer $ADMIN_API_TOKEN' http://$FQDN:8080/api/dkim"
fi

cat <<EOF

Verificar SPF/DKIM/DMARC propagados:
  dig +short MX $DOMAIN
  dig +short TXT $DOMAIN
  dig +short TXT _dmarc.$DOMAIN

EOF
