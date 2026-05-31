#!/usr/bin/env bash
set -euo pipefail
cd /opt/joemail
node -c api-index.js
docker compose up -d --force-recreate api nginx
docker compose -f dms/docker-compose.yml up -d
/opt/joemail/ops/health.sh
