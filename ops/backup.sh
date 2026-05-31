#!/usr/bin/env bash
set -euo pipefail
stamp="$(date +%Y%m%d-%H%M%S)"
out="/opt/joemail/backups"
mkdir -p "$out"
cd /opt/joemail
tar -czf "$out/joemail-config-$stamp.tar.gz" \
  api-index.js docker-compose.yml nginx/default.conf nginx/admin-index.html \
  dms/docker-compose.yml dms/.env dms/config/postfix-accounts.cf dms/config/postfix-virtual.cf dms/config/postfix-transport.cf \
  frontend/nginx.conf frontend/public/index.html frontend/public/js/app.js frontend/public/css/app.css 2>/dev/null || true
printf '%s\n' "$out/joemail-config-$stamp.tar.gz"
