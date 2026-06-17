#!/bin/bash
# Usage: ./activate-mailgun.sh <mailgun_api_key>
if [ -z "$1" ]; then
    echo "Usage: $0 <mailgun_api_key>"
    echo "Get API key from: https://app.mailgun.com/app/api/security"
    exit 1
fi

API_KEY="$1"
DOMAIN="mg.rzbal.biz.id"

# Update relay credentials
echo "[smtp.mailgun.org]:587    postmaster@${DOMAIN}:${API_KEY}" > /opt/joemail/dms/config/postfix-relay.cf

# Add relay config to DMS env
if ! grep -q "RELAY_HOST" /opt/joemail/dms/config/dms.env; then
    echo "RELAY_HOST=smtp.mailgun.org" >> /opt/joemail/dms/config/dms.env
    echo "RELAY_PORT=587" >> /opt/joemail/dms/config/dms.env
fi

# Copy relay config to container
docker cp /opt/joemail/dms/config/postfix-relay.cf joemail-dms:/etc/postfix/sasl_passwd
docker exec joemail-dms postmap /etc/postfix/sasl_passwd
docker exec joemail-dms chown root:root /etc/postfix/sasl_passwd /etc/postfix/sasl_passwd.db
docker exec joemail-dms chmod 600 /etc/postfix/sasl_passwd /etc/postfix/sasl_passwd.db

# Update postfix to use relay
docker exec joemail-dms postconf -e "relayhost = [smtp.mailgun.org]:587"
docker exec joemail-dms postconf -e "smtp_sasl_auth_enable = yes"
docker exec joemail-dms postconf -e "smtp_sasl_password_maps = hash:/etc/postfix/sasl_passwd"
docker exec joemail-dms postconf -e "smtp_sasl_security_options = noanonymous"
docker exec joemail-dms postconf -e "smtp_tls_security_level = encrypt"
docker exec joemail-dms postconf -e "smtp_tls_CAfile = /etc/ssl/certs/ca-certificates.crt"

# Reload postfix
docker exec joemail-dms postfix reload

echo ""
echo "Mailgun relay activated!"
echo "Sending domain: ${DOMAIN}"
echo "Relay: smtp.mailgun.org:587"
echo ""
echo "IMPORTANT: Add these DNS records in Cloudflare for mg.rzbal.biz.id:"
echo "  - Mailgun will show you the records after you add the domain"
echo ""
echo "Test with: curl -s -X POST http://localhost:8880/api/admin/compose ..."
