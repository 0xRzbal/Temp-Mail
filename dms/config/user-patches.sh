#!/bin/bash
# JoeMail custom Postfix configuration
# Runs on container startup

# Remove any existing joemail-webhook entries
sed -i '/joemail-webhook/d' /etc/postfix/master.cf

# Add webhook transport with original_recipient
echo "joemail-webhook unix - n n - - pipe" >> /etc/postfix/master.cf
echo "  flags=Rq user=nobody argv=/tmp/docker-mailserver/webhook-deliver.sh \${original_recipient}" >> /etc/postfix/master.cf

# Configure transport maps
postconf -e "transport_maps = hash:/etc/postfix/transport"
echo "rzbal.biz.id    joemail-webhook:" > /etc/postfix/transport
postmap /etc/postfix/transport

# Disable virtual alias rewriting so original recipient is preserved
postconf -e "virtual_alias_maps ="

# Make webhook script executable
chmod +x /tmp/docker-mailserver/webhook-deliver.sh

# Install jq if missing (needed by webhook script)
which jq >/dev/null 2>&1 || (apt-get update -qq && apt-get install -y -qq jq >/dev/null 2>&1)

echo "JoeMail patches applied"
