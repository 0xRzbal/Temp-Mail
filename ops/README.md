# JoeMail Ops

Fokus stack sekarang:
- `api-index.js` admin/API custom
- `nginx/` public/admin router
- `frontend/` public UI, jangan diganggu kalau tidak diminta
- `dms/` docker-mailserver backend

Commands:
```bash
/opt/joemail/ops/health.sh
/opt/joemail/ops/backup.sh
/opt/joemail/ops/restart.sh
/opt/joemail/ops/cleanup.sh
```

Rule:
- Public frontend tetap aman di `https://mail.rzbal.biz.id/`
- Admin fokus di `https://mail.rzbal.biz.id/admin/`
- Jangan switch backend lagi kecuali diminta eksplisit.
