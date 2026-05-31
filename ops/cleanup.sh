#!/usr/bin/env bash
set -euo pipefail
# Fokus cleanup: logs/cache only, tidak hapus mail-data/config/frontend.
find /opt/joemail/backups -type f -name 'joemail-config-*.tar.gz' -mtime +14 -delete 2>/dev/null || true
find /opt/joemail/dms/mail-logs -type f -name '*.log.*' -mtime +7 -delete 2>/dev/null || true
docker image prune -f >/dev/null || true
echo 'cleanup: ok'
