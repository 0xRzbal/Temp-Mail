#!/bin/bash
# JoeMail custom Postfix configuration
# Runs on container startup

# Disable postscreen enforcement for faster delivery
postconf -e "postscreen_greet_action = ignore"
postconf -e "postscreen_bare_newline_action = ignore"

# Disable content filter (amavis) — relay directly to API
postconf -e "content_filter ="
postconf -e "local_recipient_maps ="
postconf -e "virtual_mailbox_maps ="

# Configure transport maps — relay ALL domains to API SMTP server
postconf -e "transport_maps = hash:/etc/postfix/transport"

cat > /etc/postfix/transport << 'EOF'
mail.rzbal.biz.id    smtp:joemail-api:2525
rzbal.xyz            smtp:joemail-api:2525
EOF
postmap /etc/postfix/transport

# Disable virtual alias rewriting so original recipient is preserved
postconf -e "virtual_alias_maps ="

echo "JoeMail patches applied — direct relay to API SMTP on port 2525"
