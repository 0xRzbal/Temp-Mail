#!/usr/bin/env bash
set -euo pipefail
cd /opt/joemail
printf '[containers]\n'
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' | grep -E 'joemail-(nginx|api|dms|frontend)' || true
printf '\n[http]\n'
curl -fsS http://127.0.0.1:8880/ >/dev/null && echo 'public: ok' || echo 'public: fail'
curl -fsS http://127.0.0.1:8880/admin/ >/dev/null && echo 'admin: ok' || echo 'admin: fail'
printf '\n[mail ports]\n'
for p in 25 465 587 993 995 4190; do ss -lnt | grep -q ":$p " && echo "$p: listen" || echo "$p: down"; done
printf '\n[size]\n'
du -sh /opt/joemail/* 2>/dev/null | sort -h
