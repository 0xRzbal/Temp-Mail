#!/bin/bash
# Setup SMTP relay for better deliverability
# Usage: ./setup-relay.sh <username> <password> [relay_host]
# Example: ./setup-relay.sh user123 pass456 mail.smtp2go.com

USERNAME="${1:?Need username}"
PASSWORD="${2:?Need password}"
RELAY="${3:-mail.smtp2go.com}"
CONTAINER="joemail-dms"

# Create SASL password
docker exec $CONTAINER bash -c "echo \"[$RELAY]:2525 $USERNAME:$PASSWORD\" > /etc/postfix/sasl_passwd_relay"
docker exec $CONTAINER postmap /etc/postfix/sasl_passwd_relay
docker exec $CONTAINER chmod 600 /etc/postfix/sasl_passwd_relay /etc/postfix/sasl_passwd_relay.db

# Configure relay
docker exec $CONTAINER postconf -e "relayhost = [$RELAY]:2525"
docker exec $CONTAINER postconf -e "smtp_sasl_auth_enable = yes"
docker exec $CONTAINER postconf -e "smtp_sasl_password_maps = hash:/etc/postfix/sasl_passwd_relay"
docker exec $CONTAINER postconf -e "smtp_sasl_security_options = noanonymous"
docker exec $CONTAINER postconf -e "smtp_tls_security_level = encrypt"
docker exec $CONTAINER postconf -e "smtp_tls_CAfile = /etc/ssl/certs/ca-certificates.crt"
docker exec $CONTAINER postconf -e "smtp_tls_wrappermode = yes"
docker exec $CONTAINER postconf -e "smtp_tls_enforce_peername = no"

docker exec $CONTAINER postfix reload
echo "Relay configured: $RELAY:2525"
echo "Test: echo 'test' | sendmail -f herman@rzbal.biz.id your@email.com"
