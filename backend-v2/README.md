# JoeMail Backend v2.0 🚀

Enterprise-grade backend untuk JoeMail Temporary Email Service.

## Fitur Lengkap

| Fitur | Status | Deskripsi |
|-------|--------|-----------|
| **Temp Email** | ✅ | Generate, read, delete disposable email |
| **Custom Domain** | ✅ | User bisa pakai domain sendiri |
| **Webhook** | ✅ | Push notifikasi ke URL external |
| **Email Forwarding** | ✅ | Forward ke email real |
| **Email Reply** | ✅ | Reply dari temporary email |
| **API Keys** | ✅ | API key authentication |
| **Admin Dashboard** | ✅ | Panel admin lengkap |
| **Search** | ✅ | Full-text search (FTS5) |
| **Theme API** | ✅ | Dark/Light/Auto/Contrast |
| **Spam Detection** | ✅ | Auto kategorisasi spam |
| **Real-time** | ✅ | WebSocket push notifications |
| **Rate Limiting** | ✅ | Per-IP & per-API-key |
| **Logging** | ✅ | Winston daily rotate logs |

## Quick Start

```bash
npm install
cp .env.example .env
# Edit .env - ganti JWT_SECRET & ADMIN_PASSWORD_HASH
npm run init-db
npm start
```

## API Endpoints

### Email
- `POST /api/email/create` - Buat email baru
- `GET /api/email/inbox/:email` - Inbox dengan pagination & category filter
- `GET /api/email/message/:id` - Baca detail email
- `DELETE /api/email/message/:id` - Hapus email
- `DELETE /api/email/inbox/:email` - Hapus semua email
- `GET /api/email/refresh/:email` - Refresh inbox
- `GET /api/email/check/:email` - Cek email exists
- `GET /api/email/stats/:email` - Statistik inbox
- `GET /api/email/categories/:email` - List categories

### Domain
- `POST /api/domain/register` - Daftar custom domain
- `GET /api/domain/verify/:domain` - Verifikasi domain
- `GET /api/domain/list` - List custom domains
- `DELETE /api/domain/:domain` - Hapus domain

### Forwarding
- `POST /api/forwarding/create` - Buat forwarding rule
- `GET /api/forwarding/:email` - List forwarding rules
- `DELETE /api/forwarding/:id` - Hapus forwarding rule

### Reply
- `POST /api/reply/send` - Kirim reply
- `GET /api/reply/history/:emailId` - History reply

### Webhooks
- `POST /api/webhooks/create` - Buat webhook
- `GET /api/webhooks/list` - List webhooks
- `GET /api/webhooks/deliveries/:id` - Delivery history
- `DELETE /api/webhooks/:id` - Hapus webhook

### Search
- `GET /api/search?q=query&email=addr` - Full-text search

### Theme
- `GET /api/theme/:email` - Get theme preference
- `PUT /api/theme/:email` - Update theme

### API Keys
- `POST /api/keys/create` - Generate API key
- `GET /api/keys/list` - List API keys
- `DELETE /api/keys/:id` - Revoke API key

### Admin
- `POST /api/admin/login` - Admin login
- `GET /api/admin/dashboard` - Dashboard stats
- `GET /api/admin/users` - List users
- `GET /api/admin/emails` - List all emails
- `GET /api/admin/domains` - Manage domains
- `GET /api/admin/webhooks` - Manage webhooks
- `GET /api/admin/stats` - Detailed stats
- `DELETE /api/admin/email/:id` - Force delete email
- `DELETE /api/admin/user/:email` - Ban user

### Stats & Health
- `GET /api/stats` - Public statistics
- `GET /api/health` - Health check

## WebSocket Events

```javascript
// Subscribe
socket.emit('subscribe', 'user@mail.rzbal.biz.id');

// Events
socket.on('new_email', (data) => { ... });
socket.on('email_deleted', (data) => { ... });
socket.on('inbox_cleared', (data) => { ... });
socket.on('subscribed', (data) => { ... });
```

## Deployment

### PM2
```bash
npm install -g pm2
pm2 start server.js --name joemail-backend
pm2 save
pm2 startup
```

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000 2525
CMD ["npm", "start"]
```

## License
MIT
