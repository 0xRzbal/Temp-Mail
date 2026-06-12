require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const hpp = require('hpp');
const path = require('path');
const cron = require('node-cron');

const logger = require('./src/utils/logger');
const db = require('./src/utils/db');
const smtpService = require('./src/services/smtpService');
const cleanupService = require('./src/utils/cleanup');
const webhookService = require('./src/services/webhookService');

const emailRoutes = require('./src/routes/email');
const statsRoutes = require('./src/routes/stats');
const healthRoutes = require('./src/routes/health');
const adminRoutes = require('./src/routes/admin');
const domainRoutes = require('./src/routes/domain');
const forwardingRoutes = require('./src/routes/forwarding');
const replyRoutes = require('./src/routes/reply');
const themeRoutes = require('./src/routes/theme');
const apiKeyRoutes = require('./src/routes/apikey');
const searchRoutes = require('./src/routes/search');
const webhookRoutes = require('./src/routes/webhook');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
    methods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

const PORT = process.env.PORT || 3000;
app.set('io', io);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['*'];
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Requested-With']
}));

app.use(compression());
app.use(hpp());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] || 'unknown'
});
app.use('/api/', limiter);

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));
}

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/public', express.static(path.join(__dirname, 'public')));

app.use('/api/email', emailRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/domain', domainRoutes);
app.use('/api/forwarding', forwardingRoutes);
app.use('/api/reply', replyRoutes);
app.use('/api/theme', themeRoutes);
app.use('/api/keys', apiKeyRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/webhooks', webhookRoutes);

app.get('/', (req, res) => {
  res.json({
    name: 'JoeMail API v2.0',
    version: '2.0.0',
    status: 'running',
    features: ['temp-email', 'custom-domain', 'webhook', 'forwarding', 'reply', 'api-keys', 'admin-panel', 'search', 'theme'],
    endpoints: {
      email: '/api/email', stats: '/api/stats', health: '/api/health',
      admin: '/api/admin', domain: '/api/domain', forwarding: '/api/forwarding',
      reply: '/api/reply', theme: '/api/theme', apiKeys: '/api/keys',
      search: '/api/search', webhooks: '/api/webhooks'
    }
  });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  logger.error('Error:', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const activeRooms = new Map();

io.on('connection', (socket) => {
  logger.info(`[WS] Client connected: ${socket.id}`);

  socket.on('subscribe', (email) => {
    if (!email || typeof email !== 'string') return;
    const normalizedEmail = email.toLowerCase().trim();
    socket.join(normalizedEmail);
    if (!activeRooms.has(normalizedEmail)) activeRooms.set(normalizedEmail, new Set());
    activeRooms.get(normalizedEmail).add(socket.id);
    logger.info(`[WS] ${socket.id} subscribed to ${normalizedEmail}`);
    socket.emit('subscribed', { email: normalizedEmail, timestamp: new Date().toISOString() });
  });

  socket.on('unsubscribe', (email) => {
    if (!email) return;
    const normalizedEmail = email.toLowerCase().trim();
    socket.leave(normalizedEmail);
    if (activeRooms.has(normalizedEmail)) {
      activeRooms.get(normalizedEmail).delete(socket.id);
      if (activeRooms.get(normalizedEmail).size === 0) activeRooms.delete(normalizedEmail);
    }
    logger.info(`[WS] ${socket.id} unsubscribed from ${normalizedEmail}`);
  });

  socket.on('disconnect', () => {
    for (const [email, sockets] of activeRooms) {
      if (sockets.has(socket.id)) {
        sockets.delete(socket.id);
        if (sockets.size === 0) activeRooms.delete(email);
      }
    }
    logger.info(`[WS] Client disconnected: ${socket.id}`);
  });
});

app.set('activeRooms', activeRooms);

const cleanupCron = process.env.CLEANUP_CRON || '0 */1 * * *';
cron.schedule(cleanupCron, () => {
  logger.info('[CRON] Running cleanup job...');
  cleanupService.cleanupExpiredEmails();
});

cron.schedule('*/5 * * * *', () => {
  if (process.env.WEBHOOKS_ENABLED === 'true') {
    webhookService.retryFailedWebhooks();
  }
});

cron.schedule('0 0 * * *', () => {
  logger.info('[CRON] Running daily stats aggregation...');
  cleanupService.aggregateDailyStats();
});

async function startServer() {
  try {
    db.initDatabase();
    logger.info('[DB] Database initialized');

    smtpService.startSMTPServer(io);
    logger.info('[SMTP] SMTP server starting...');

    server.listen(PORT, () => {
      logger.info(`\n========================================`);
      logger.info(`🚀 JoeMail Backend v2.0`);
      logger.info(`📡 HTTP API: http://localhost:${PORT}`);
      logger.info(`📧 SMTP Server: localhost:${process.env.SMTP_PORT || 2525}`);
      logger.info(`🔌 WebSocket: ws://localhost:${PORT}`);
      logger.info(`========================================\n`);
    });
  } catch (error) {
    logger.error('[FATAL] Failed to start server:', error);
    process.exit(1);
  }
}

function gracefulShutdown() {
  logger.info('[SHUTDOWN] Received signal, shutting down gracefully...');
  server.close(() => {
    logger.info('[SHUTDOWN] HTTP server closed');
    db.close();
    process.exit(0);
  });
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

startServer();
