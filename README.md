# JoeMail — Disposable Email Platform

Self-hosted temporary email service with admin panel, SMTP relay, multi-domain support, and API key authentication.

## Features

- **Temp Email Addresses** — Generate disposable addresses on any configured domain
- **Admin Panel** — Full dashboard: emails, addresses, domains, SMTP relay, statistics
- **Multi-Domain** — Manage multiple mail domains with per-domain DNS verification
- **SMTP Relay** — Outbound relay via SMTP2GO (or any SMTP provider) with presets
- **API Key Auth** — Programmatic access for bots and automation
- **Webhooks** — Push incoming email events to external endpoints
- **Forwarding** — Auto-forward incoming mail to external addresses
- **DMARC Reporting** — Aggregate DMARC report parsing and storage

## Stack

| Layer | Tech |
|-------|------|
| Mail server | Docker Mail Server (DMS) |
| API backend | Node.js (Express) |
| Frontend | Vanilla JS + CSS (SPA) |
| Admin panel | Vanilla JS (served via nginx) |
| Database | SQLite |
| Proxy | Nginx (Alpine) |
| Containers | Docker Compose |

## Quick Start

```bash
# Clone
git clone git@github.com:0xRzbal/Temp-Mail.git
cd Temp-Mail

# Configure environment
cp backend-v2/.env.example backend-v2/.env
cp dms/config/dms.env.example dms/config/dms.env
# Edit .env files with your domain, credentials, etc.

# Build & run
docker compose up -d --build

# Access
# Frontend: http://localhost:8880
# Admin:    http://localhost:8880/admin
# API:      http://localhost:8880/api
```

## Project Structure

```
.
├── backend-v2/          # API server (Node.js/Express)
│   └── src/routes/      # API endpoints
├── frontend/            # Public frontend (SPA)
│   └── public/          # Static assets
├── nginx/               # Nginx config + admin panel files
│   ├── admin-files/     # Admin panel JS/HTML/CSS
│   └── default.conf     # Reverse proxy config
├── dms/                 # Docker Mail Server config
│   └── config/          # DMS env & mail config
├── ops/                 # Operational scripts
├── docker-compose.yml   # Service orchestration
├── relay-manager.sh     # SMTP relay config manager
└── relay-watcher.sh     # Relay status monitor
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/domains` | List active domains |
| `GET` | `/api/emails/:address` | Fetch emails for address |
| `POST` | `/api/addresses` | Generate new temp address |
| `POST` | `/api/reply/send` | Send reply from temp address |
| `POST` | `/api/forwarding` | Set forwarding rule |
| `POST` | `/api/webhooks` | Register webhook endpoint |
| `POST` | `/api/admin/login` | Admin authentication |
| `GET` | `/api/admin/dashboard` | Dashboard stats |
| `GET` | `/api/admin/domains` | Domain management |
| `GET` | `/api/admin/relay/status` | SMTP relay status |

## Configuration

### Environment Variables

```env
# Backend
PORT=3000
JWT_SECRET=your-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-password
DB_PATH=/app/database/joemail.db

# SMTP Relay (optional)
RELAY_HOST=mail.smtp2go.com
RELAY_PORT=2525
RELAY_USER=your-username
RELAY_PASS=your-password
```

### DNS Records

For each domain, configure:

1. **TXT** — Domain verification (`joemail-verify=<token>`)
2. **MX** — `mail.yourdomain.com` (priority 10)
3. **A** — `mail.yourdomain.com` → your server IP
4. **TXT (SPF)** — `v=spf1 mx a ip4:<your-ip> ~all`
5. **TXT (DKIM)** — DKIM public key
6. **TXT (DMARC)** — `v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com`

## License

Private — Internal use only.
