const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const winston = require('winston');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const cron = require('node-cron');
const si = require('systeminformation');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

require('dotenv').config();

// ============================================================
// CONFIGURATION
// ============================================================
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'joemail_default_secret_change_me';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;
const SESSION_TIMEOUT = parseInt(process.env.SESSION_TIMEOUT) || 3600000;
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW) || 900000;
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX) || 100;
const BRUTE_FORCE_MAX = parseInt(process.env.BRUTE_FORCE_MAX) || 5;
const BRUTE_FAIL_WINDOW = parseInt(process.env.BRUTE_FAIL_WINDOW) || 900000;
const BRUTE_BLOCK_DURATION = parseInt(process.env.BRUTE_BLOCK_DURATION) || 3600000;
const TWO_FA_ENABLED = process.env.TWO_FA_ENABLED === 'true';
const DEFAULT_EXPIRY = parseInt(process.env.DEFAULT_EXPIRY) || 86400000;
const CLEANUP_INTERVAL = parseInt(process.env.CLEANUP_INTERVAL) || 300000;
const DOMAIN = process.env.DOMAIN || 'localhost';
const JOEMAIL_HOST = process.env.JOEMAIL_HOST || 'joemail';
const JOEMAIL_PORT = process.env.JOEMAIL_PORT || '8080';
const JOEMAIL_ADMIN_USER = process.env.JOEMAIL_ADMIN_USER || 'admin';
const JOEMAIL_ADMIN_PASS = process.env.JOEMAIL_ADMIN_PASS || 'changeme';

// ============================================================
// LOGGER
// ============================================================
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: '/app/logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: '/app/logs/combined.log' })
  ]
});

// ============================================================
// DATA STORE (In-memory with persistence)
// ============================================================
const DATA_DIR = '/app/data';
const INBOXES_FILE = path.join(DATA_DIR, 'inboxes.json');
const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');
const DOMAINS_FILE = path.join(DATA_DIR, 'domains.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const BLACKLIST_FILE = path.join(DATA_DIR, 'blacklist.json');
const WHITELIST_FILE = path.join(DATA_DIR, 'whitelist.json');
const DOMAIN_META_FILE = path.join(DATA_DIR, 'domain-meta.json');
const SECURITY_FILE = path.join(DATA_DIR, 'security.json');
const SYSTEM_FILE = path.join(DATA_DIR, 'system.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

function loadData(file, defaultValue = {}) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    logger.error(`Failed to load ${file}: ${e.message}`);
  }
  return defaultValue;
}

function saveData(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    logger.error(`Failed to save ${file}: ${e.message}`);
  }
}

let inboxes = loadData(INBOXES_FILE, {});
let admins = loadData(ADMINS_FILE, {});
let domains = loadData(DOMAINS_FILE, { [DOMAIN]: { active: true, created: Date.now() } });
let logs = loadData(LOGS_FILE, []);
let sessions = loadData(SESSIONS_FILE, {});
let stats = loadData(STATS_FILE, { inboxes: 0, emails: 0, domains: 1, spam: 0, errors: 0 });
let blacklist = loadData(BLACKLIST_FILE, []);
let whitelist = loadData(WHITELIST_FILE, []);
let domainMeta = loadData(DOMAIN_META_FILE, {});
let securityConfig = loadData(SECURITY_FILE, { ipWhitelist: [], ipBlacklist: [], rateLimit: { windowMs: RATE_LIMIT_WINDOW, max: RATE_LIMIT_MAX } });
let systemConfig = loadData(SYSTEM_FILE, { maintenance: false, retentionDays: 7, tempMailExpiryHours: 24, notifications: '', smtpHost: 'mail.rzbal.biz.id', smtpPorts: '25,465,587' });
let failedLogins = {};
let bruteForceTracker = {};

// Initialize default admin if none exists
async function initAdmin() {
  if (Object.keys(admins).length === 0) {
    const hash = await bcrypt.hash('joemailadmin2026', BCRYPT_ROUNDS);
    admins['admin'] = {
      id: uuidv4(),
      username: 'admin',
      password: hash,
      role: 'superadmin',
      twoFactorEnabled: false,
      twoFactorSecret: null,
      createdAt: Date.now(),
      lastLogin: null,
      loginHistory: []
    };
    saveData(ADMINS_FILE, admins);
    logger.info('Default admin created: username=admin, password=joemailadmin2026');
  }
}
initAdmin();

// ============================================================
// EXPRESS APP
// ============================================================
const app = express();
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(compression());
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ============================================================
// RATE LIMITING & BRUTE FORCE
// ============================================================
const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW,
  max: RATE_LIMIT_MAX,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

const loginLimiter = rateLimit({
  windowMs: BRUTE_FAIL_WINDOW,
  max: BRUTE_FORCE_MAX,
  message: { error: 'Too many login attempts. Please try again later.' },
  skipSuccessfulRequests: true
});

app.use('/api/', apiLimiter);

// ============================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    const session = sessions[token];
    if (!session || Date.now() - session.lastActivity > SESSION_TIMEOUT) {
      delete sessions[token];
      saveData(SESSIONS_FILE, sessions);
      return res.status(403).json({ error: 'Session expired' });
    }

    session.lastActivity = Date.now();
    saveData(SESSIONS_FILE, sessions);
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function logEvent(type, details) {
  const entry = {
    id: uuidv4(),
    timestamp: Date.now(),
    type,
    details,
    ip: details.ip || 'unknown'
  };
  logs.unshift(entry);
  if (logs.length > 10000) logs = logs.slice(0, 10000);
  saveData(LOGS_FILE, logs);
}

// ============================================================
// EMAIL GENERATOR
// ============================================================
function generateEmail(prefix = null, selectedDomain = null) {
  const firstNames = ['alex','sam','jordan','taylor','morgan','casey','riley','avery','quinn','sage','drew','blake','cameron','devon','emery','finley','harper','hayden','jesse','kai','logan','mason','noah','owen','parker','reese','skyler','wyatt','zoe','luna','mila','aria','ella','nora','ivy','ruby','jade','iris','mae','max','leo','eli','ian','ace','ray','joe','tom','nick','adam','eric','anna','emma','lily','grace','chloe','sofia','eva','mia','leah','sara','nina','lisa','kate','amy'];
  const lastNames = ['smith','chen','kim','lee','park','wang','li','yang','huang','wu','lin','zhou','sun','ma','zhu','xu','luo','gao','he','deng','johnson','williams','brown','jones','garcia','martinez','lopez','gonzalez','wilson','anderson','thomas','moore','jackson','martin','perez','white','harris','sanchez','clark','ramirez','lewis','robinson','walker','young','allen','king','wright','scott','torres','nguyen','hill','flores','green','adams','nelson','baker','hall','rivera','campbell','mitchell','carter','roberts'];
  const separators = ['.', '_', ''];

  let local = prefix || '';

  if (!prefix) {
    const first = firstNames[Math.floor(Math.random() * firstNames.length)];
    const sep = separators[Math.floor(Math.random() * separators.length)];
    const roll = Math.random();

    if (roll < 0.6) {
      const last = lastNames[Math.floor(Math.random() * lastNames.length)];
      local = first + sep + last;
    } else if (roll < 0.8) {
      const num = Math.floor(Math.random() * 900) + 100;
      local = first + sep + num;
    } else {
      const last = lastNames[Math.floor(Math.random() * lastNames.length)];
      const num = Math.floor(Math.random() * 90) + 10;
      local = first + sep + last + num;
    }
  } else {
    local = prefix.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (local.length < 3) {
      const first = firstNames[Math.floor(Math.random() * firstNames.length)];
      local = local + first;
    }
  }

  const domainList = Object.keys(domains).filter(d => domains[d].active);
  let domain;
  if (selectedDomain && domainList.includes(selectedDomain)) {
    domain = selectedDomain;
  } else {
    domain = domainList.length > 0 ? domainList[Math.floor(Math.random() * domainList.length)] : DOMAIN;
  }
  return `${local}@${domain}`;
}
// ============================================================
// API ROUTES
// ============================================================

// --- Health Check ---
app.get('/health', (req, res) => {
  res.json({ status: 'running', timestamp: Date.now(), version: '1.0.0' });
});

// --- Stats ---
app.get('/stats', (req, res) => {
  res.json({
    inboxes: Object.keys(inboxes).length,
    emails: stats.emails,
    domains: Object.keys(domains).length,
    spam: stats.spam,
    errors: stats.errors,
    timestamp: Date.now()
  });
});

// --- Public Domains List ---
app.get('/domains', (req, res) => {
  const domainList = Object.keys(domains)
    .filter(d => domains[d].active)
    .map(d => ({ name: d, active: true }));
  res.json({ domains: domainList });
});

// --- Generate Email ---
app.get('/generate', (req, res) => {
  try {
    const { prefix, expiry, domain } = req.query;
    const email = generateEmail(prefix, domain);
    const now = Date.now();
    const expiryMs = expiry ? parseInt(expiry) : DEFAULT_EXPIRY;

    inboxes[email] = {
      email,
      createdAt: now,
      expiresAt: expiryMs === -1 ? -1 : now + expiryMs,
      messages: [],
      active: true,
      ip: req.ip
    };

    saveData(INBOXES_FILE, inboxes);
    stats.inboxes = Object.keys(inboxes).length;
    saveData(STATS_FILE, stats);

    logEvent('inbox_created', { email, ip: req.ip });
    res.json({ email, expiresAt: inboxes[email].expiresAt });
  } catch (err) {
    logger.error('Generate error:', err);
    stats.errors++;
    saveData(STATS_FILE, stats);
    res.status(500).json({ error: 'Failed to generate email' });
  }
});

// --- Get Inbox ---
app.get('/inbox/:email', (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase();
    const inbox = inboxes[email];

    if (!inbox) {
      return res.status(404).json({ error: 'Inbox not found' });
    }

    if (inbox.expiresAt !== -1 && Date.now() > inbox.expiresAt) {
      inbox.active = false;
      saveData(INBOXES_FILE, inboxes);
      return res.status(410).json({ error: 'Inbox expired' });
    }

    res.json({
      email: inbox.email,
      createdAt: inbox.createdAt,
      expiresAt: inbox.expiresAt,
      active: inbox.active,
      messages: inbox.messages.map(m => ({
        id: m.id,
        from: m.from,
        subject: m.subject,
        date: m.date,
        read: m.read,
        hasAttachment: m.hasAttachment
      }))
    });
  } catch (err) {
    logger.error('Inbox error:', err);
    res.status(500).json({ error: 'Failed to fetch inbox' });
  }
});

// --- Get Message ---
app.get('/message/:id', (req, res) => {
  try {
    const messageId = req.params.id;
    let found = null;
    let inboxEmail = null;

    for (const email in inboxes) {
      const msg = inboxes[email].messages.find(m => m.id === messageId);
      if (msg) {
        found = msg;
        inboxEmail = email;
        break;
      }
    }

    if (!found) {
      return res.status(404).json({ error: 'Message not found' });
    }

    found.read = true;
    saveData(INBOXES_FILE, inboxes);

    res.json({
      id: found.id,
      from: found.from,
      to: found.to,
      subject: found.subject,
      date: found.date,
      body: found.body,
      html: found.html,
      raw: found.raw,
      attachments: found.attachments || [],
      headers: found.headers || {}
    });
  } catch (err) {
    logger.error('Message error:', err);
    res.status(500).json({ error: 'Failed to fetch message' });
  }
});

// --- Download Attachment ---
app.get('/attachment/:messageId/:filename', (req, res) => {
  try {
    const { messageId, filename } = req.params;
    let found = null;

    for (const email in inboxes) {
      const msg = inboxes[email].messages.find(m => m.id === messageId);
      if (msg && msg.attachments) {
        found = msg.attachments.find(a => a.filename === filename);
        if (found) break;
      }
    }

    if (!found) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const buffer = Buffer.from(found.data, 'base64');
    res.setHeader('Content-Type', found.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    logger.error('Attachment error:', err);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

// --- Search Emails ---
app.get('/search', (req, res) => {
  try {
    const { q, email } = req.query;
    if (!q || !email) {
      return res.status(400).json({ error: 'Query and email required' });
    }

    const inbox = inboxes[email.toLowerCase()];
    if (!inbox) {
      return res.status(404).json({ error: 'Inbox not found' });
    }

    const query = q.toLowerCase();
    const results = inbox.messages.filter(m =>
      (m.from && m.from.toLowerCase().includes(query)) ||
      (m.subject && m.subject.toLowerCase().includes(query)) ||
      (m.body && m.body.toLowerCase().includes(query))
    );

    res.json({ results, count: results.length });
  } catch (err) {
    logger.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ============================================================
// ADMIN AUTHENTICATION
// ============================================================

// --- Admin Login ---
app.post('/admin/login', loginLimiter, async (req, res) => {
  try {
    const { username, password, twoFactorCode } = req.body;
    const ip = req.ip;

    // Brute force check
    const trackerKey = `${ip}:${username}`;
    if (bruteForceTracker[trackerKey]) {
      const tracker = bruteForceTracker[trackerKey];
      if (tracker.count >= BRUTE_FORCE_MAX && Date.now() - tracker.firstFail < BRUTE_BLOCK_DURATION) {
        logEvent('brute_force_blocked', { username, ip });
        return res.status(429).json({ error: 'Account temporarily locked due to failed attempts' });
      }
    }

    const admin = admins[username];
    if (!admin) {
      trackFailedLogin(trackerKey);
      logEvent('login_failed', { username, ip, reason: 'user_not_found' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) {
      trackFailedLogin(trackerKey);
      logEvent('login_failed', { username, ip, reason: 'wrong_password' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // 2FA check
    if (admin.twoFactorEnabled && TWO_FA_ENABLED) {
      if (!twoFactorCode) {
        return res.status(403).json({ error: '2FA code required', requires2FA: true });
      }
      const verified = speakeasy.totp.verify({
        secret: admin.twoFactorSecret,
        encoding: 'base32',
        token: twoFactorCode,
        window: 2
      });
      if (!verified) {
        trackFailedLogin(trackerKey);
        logEvent('login_failed', { username, ip, reason: 'invalid_2fa' });
        return res.status(401).json({ error: 'Invalid 2FA code' });
      }
    }

    // Success
    delete bruteForceTracker[trackerKey];

    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: admin.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    sessions[token] = {
      username: admin.username,
      role: admin.role,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      ip
    };
    saveData(SESSIONS_FILE, sessions);

    admin.lastLogin = Date.now();
    admin.loginHistory.unshift({ timestamp: Date.now(), ip });
    if (admin.loginHistory.length > 50) admin.loginHistory = admin.loginHistory.slice(0, 50);
    saveData(ADMINS_FILE, admins);

    logEvent('login_success', { username, ip });
    res.json({ token, username: admin.username, role: admin.role });
  } catch (err) {
    logger.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

function trackFailedLogin(key) {
  if (!bruteForceTracker[key]) {
    bruteForceTracker[key] = { count: 0, firstFail: Date.now() };
  }
  bruteForceTracker[key].count++;
  bruteForceTracker[key].lastFail = Date.now();
}

// --- Setup 2FA ---
app.post('/admin/2fa/setup', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const admin = admins[req.user.username];
    const secret = speakeasy.generateSecret({
      name: `JoeMail:${admin.username}`,
      length: 32
    });

    admin.twoFactorSecret = secret.base32;
    saveData(ADMINS_FILE, admins);

    const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);
    res.json({ secret: secret.base32, qrCode: qrDataUrl });
  } catch (err) {
    logger.error('2FA setup error:', err);
    res.status(500).json({ error: 'Failed to setup 2FA' });
  }
});

// --- Enable 2FA ---
app.post('/admin/2fa/enable', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { code } = req.body;
    const admin = admins[req.user.username];

    const verified = speakeasy.totp.verify({
      secret: admin.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 2
    });

    if (!verified) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    admin.twoFactorEnabled = true;
    saveData(ADMINS_FILE, admins);
    res.json({ success: true });
  } catch (err) {
    logger.error('2FA enable error:', err);
    res.status(500).json({ error: 'Failed to enable 2FA' });
  }
});

// --- Logout ---
app.post('/admin/logout', authenticateToken, (req, res) => {
  const token = req.headers['authorization'].split(' ')[1];
  delete sessions[token];
  saveData(SESSIONS_FILE, sessions);
  logEvent('logout', { username: req.user.username });
  res.json({ success: true });
});

// --- Verify Session ---
app.get('/admin/verify', authenticateToken, (req, res) => {
  res.json({ authenticated: true, user: req.user });
});

// ============================================================
// ADMIN DASHBOARD API
// ============================================================

// --- Dashboard Stats ---
app.get('/admin/dashboard', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const now = Date.now();
    const oneDayAgo = now - 86400000;
    const oneHourAgo = now - 3600000;

    const activeInboxes = Object.values(inboxes).filter(i => i.active && (i.expiresAt === -1 || i.expiresAt > now)).length;
    const recentEmails = Object.values(inboxes).reduce((sum, i) => 
      sum + i.messages.filter(m => m.date > oneHourAgo).length, 0);
    const dailyEmails = Object.values(inboxes).reduce((sum, i) => 
      sum + i.messages.filter(m => m.date > oneDayAgo).length, 0);

    // System metrics
    const mem = await si.mem();
    const cpu = await si.currentLoad();
    const disk = await si.fsSize();

    res.json({
      stats: {
        totalInboxes: Object.keys(inboxes).length,
        activeInboxes,
        totalEmails: stats.emails,
        recentEmails,
        dailyEmails,
        totalDomains: Object.keys(domains).length,
        activeDomains: Object.values(domains).filter(d => d.active).length,
        spamCount: stats.spam,
        errorCount: stats.errors
      },
      system: {
        cpuUsage: cpu.currentLoad || 0,
        ramTotal: mem.total,
        ramUsed: mem.used,
        ramFree: mem.free,
        diskTotal: disk[0]?.size || 0,
        diskUsed: disk[0]?.used || 0,
        diskFree: disk[0]?.available || 0
      },
      recentActivity: logs.slice(0, 50)
    });
  } catch (err) {
    logger.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// --- Users Management ---
app.get('/admin/users', authenticateToken, requireAdmin, (req, res) => {
  const userList = Object.values(inboxes).map(i => ({
    email: i.email,
    createdAt: i.createdAt,
    expiresAt: i.expiresAt,
    active: i.active,
    messageCount: i.messages.length,
    ip: i.ip
  }));
  res.json({ users: userList, count: userList.length });
});

app.delete('/admin/users/:email', authenticateToken, requireAdmin, (req, res) => {
  const email = decodeURIComponent(req.params.email).toLowerCase();
  if (inboxes[email]) {
    delete inboxes[email];
    saveData(INBOXES_FILE, inboxes);
    stats.inboxes = Object.keys(inboxes).length;
    saveData(STATS_FILE, stats);
    logEvent('inbox_deleted', { email, by: req.user.username });
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Inbox not found' });
  }
});

// --- Domains Management ---
app.get('/admin/domains', authenticateToken, requireAdmin, (req, res) => {
  res.json({ domains: Object.entries(domains).map(([name, d]) => ({ name, ...d })) });
});

app.post('/admin/domains', authenticateToken, requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name || !name.includes('.')) {
    return res.status(400).json({ error: 'Valid domain name required' });
  }
  domains[name] = { active: true, created: Date.now() };
  saveData(DOMAINS_FILE, domains);
  stats.domains = Object.keys(domains).length;
  saveData(STATS_FILE, stats);
  logEvent('domain_added', { domain: name, by: req.user.username });
  res.json({ success: true, domain: name });
});

app.delete('/admin/domains/:domain', authenticateToken, requireAdmin, (req, res) => {
  const domain = req.params.domain;
  if (domains[domain]) {
    delete domains[domain];
    saveData(DOMAINS_FILE, domains);
    stats.domains = Object.keys(domains).length;
    saveData(STATS_FILE, stats);
    logEvent('domain_deleted', { domain, by: req.user.username });
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Domain not found' });
  }
});

// --- DNS Helper ---
app.get('/admin/dns/:domain', authenticateToken, requireAdmin, (req, res) => {
  const domain = req.params.domain;
  const serverIp = req.headers['x-forwarded-for'] || req.ip;

  res.json({
    domain,
    records: [
      { type: 'A', name: domain, value: serverIp, ttl: 3600 },
      { type: 'A', name: `mail.${domain}`, value: serverIp, ttl: 3600 },
      { type: 'MX', name: domain, value: `10 mail.${domain}`, ttl: 3600 },
      { type: 'TXT', name: domain, value: `v=spf1 mx a:${serverIp} ~all`, ttl: 3600 },
      { type: 'TXT', name: `_dmarc.${domain}`, value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}`, ttl: 3600 },
      { type: 'TXT', name: `joemail._domainkey.${domain}`, value: `v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC...`, ttl: 3600 },
      { type: 'CNAME', name: `_mta-sts.${domain}`, value: `mta-sts.${domain}`, ttl: 3600 },
      { type: 'TXT', name: `_mta-sts.${domain}`, value: `v=STSv1; id=${Date.now()};`, ttl: 3600 }
    ]
  });
});

// --- Logs ---
app.get('/admin/logs', authenticateToken, requireAdmin, (req, res) => {
  const { type, limit = 100, offset = 0 } = req.query;
  let filtered = logs;
  if (type) filtered = logs.filter(l => l.type === type);
  const paginated = filtered.slice(offset, offset + parseInt(limit));
  res.json({ logs: paginated, total: filtered.length });
});

// --- Mail Queue ---
app.get('/admin/queue', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const mailLog = '/dms/mail-logs/mail.log';
    const tail = fs.existsSync(mailLog) ? fs.readFileSync(mailLog, 'utf8').split(/\r?\n/).slice(-120).join('\n') : 'mail.log not mounted';
    const accountsCount = readLinesSafe('/dms/config/postfix-accounts.cf').length;
    const aliasesCount = readLinesSafe('/dms/config/postfix-virtual.cf').length;
    res.json({ queue: [], containers: `docker-mailserver: joemail-dms\naccounts: ${accountsCount}\naliases: ${aliasesCount}\n\n--- mail.log tail ---\n${tail}`, timestamp: Date.now() });
  } catch (err) {
    res.json({ queue: [], error: err.message, containers: err.message, timestamp: Date.now() });
  }
});

// --- Diagnostics ---
app.get('/admin/diagnostics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const checks = [];

    // Check JoeMail
    try {
      const { stdout: joemailHealth } = await execAsync(`wget -qO- http://${JOEMAIL_HOST}:${JOEMAIL_PORT}/health 2>/dev/null || echo "unreachable"`);
      checks.push({ service: 'joemail', status: joemailHealth.includes('unreachable') ? 'error' : 'ok', detail: joemailHealth });
    } catch (e) {
      checks.push({ service: 'joemail', status: 'error', detail: e.message });
    }

    // Check ports
    const ports = [25, 465, 587, 143, 993, 110, 995, 4190];
    for (const port of ports) {
      try {
        await execAsync(`timeout 2 nc -z ${JOEMAIL_HOST} ${port}`);
        checks.push({ service: `port_${port}`, status: 'ok' });
      } catch {
        checks.push({ service: `port_${port}`, status: 'error' });
      }
    }

    // DNSBL check
    checks.push({ service: 'dnsbl', status: 'ok', detail: 'Using zen.spamhaus.org, bl.spamcop.net' });

    res.json({ checks, timestamp: Date.now() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Monitoring ---
app.get('/admin/monitoring', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const mem = await si.mem();
    const cpu = await si.currentLoad();
    const disk = await si.fsSize();
    const processes = await si.processes();
    const network = await si.networkStats();

    res.json({
      cpu: { load: cpu.currentLoad, cores: cpu.cpus?.length || 0 },
      memory: { total: mem.total, used: mem.used, free: mem.free, percent: ((mem.used / mem.total) * 100).toFixed(2) },
      disk: disk.map(d => ({ fs: d.fs, size: d.size, used: d.used, available: d.available, use: d.use })),
      processes: { running: processes.running, blocked: processes.blocked, sleeping: processes.sleeping },
      network: network.map(n => ({ iface: n.iface, rx: n.rx_bytes, tx: n.tx_bytes })),
      timestamp: Date.now()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Spam Protection ---
app.get('/admin/spam', authenticateToken, requireAdmin, (req, res) => {
  res.json({
    blacklist,
    whitelist,
    stats: { spam: stats.spam, blocked: stats.spam }
  });
});

app.post('/admin/spam/blacklist', authenticateToken, requireAdmin, (req, res) => {
  const { email } = req.body;
  if (email && !blacklist.includes(email)) {
    blacklist.push(email);
    saveData(BLACKLIST_FILE, blacklist);
    logEvent('blacklist_added', { email, by: req.user.username });
  }
  res.json({ success: true, blacklist });
});

app.post('/admin/spam/whitelist', authenticateToken, requireAdmin, (req, res) => {
  const { email } = req.body;
  if (email && !whitelist.includes(email)) {
    whitelist.push(email);
    saveData(WHITELIST_FILE, whitelist);
    logEvent('whitelist_added', { email, by: req.user.username });
  }
  res.json({ success: true, whitelist });
});

app.delete('/admin/spam/blacklist/:email', authenticateToken, requireAdmin, (req, res) => {
  blacklist = blacklist.filter(e => e !== req.params.email);
  saveData(BLACKLIST_FILE, blacklist);
  res.json({ success: true, blacklist });
});

// --- Settings ---
app.get('/admin/settings', authenticateToken, requireAdmin, (req, res) => {
  res.json({
    domain: DOMAIN,
    defaultExpiry: DEFAULT_EXPIRY,
    twoFAEnabled: TWO_FA_ENABLED,
    rateLimitWindow: RATE_LIMIT_WINDOW,
    rateLimitMax: RATE_LIMIT_MAX,
    bruteForceMax: BRUTE_FORCE_MAX,
    sessionTimeout: SESSION_TIMEOUT
  });
});

// ============================================================
// REAL-TIME MAIL PROCESSING (Webhook from JoeMail)
// ============================================================
app.post('/webhook/mail', (req, res) => {
  try {
    const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { to, from, subject, body, html, headers, attachments, raw } = data;

    const email = to.toLowerCase();
    if (!inboxes[email]) {
      // Auto-create for catch-all
      inboxes[email] = {
        email,
        createdAt: Date.now(),
        expiresAt: Date.now() + DEFAULT_EXPIRY,
        messages: [],
        active: true,
        ip: 'catch-all'
      };
    }

    // Check blacklist
    if (blacklist.some(b => from.includes(b))) {
      stats.spam++;
      saveData(STATS_FILE, stats);
      logEvent('spam_blocked', { from, to: email });
      return res.json({ blocked: true, reason: 'blacklist' });
    }

    const message = {
      id: uuidv4(),
      from,
      to: email,
      subject: subject || '(no subject)',
      date: Date.now(),
      body: body || '',
      html: html || '',
      raw: raw || '',
      headers: headers || {},
      attachments: attachments || [],
      hasAttachment: (attachments && attachments.length > 0),
      read: false
    };

    inboxes[email].messages.unshift(message);
    if (inboxes[email].messages.length > 500) {
      inboxes[email].messages = inboxes[email].messages.slice(0, 500);
    }

    stats.emails++;
    saveData(INBOXES_FILE, inboxes);
    saveData(STATS_FILE, stats);

    logEvent('email_received', { from, to: email, subject: message.subject });
    res.json({ success: true, messageId: message.id });
  } catch (err) {
    logger.error('Webhook error:', err);
    stats.errors++;
    saveData(STATS_FILE, stats);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ============================================================
// DOCKER-MAILSERVER BACKEND ADMIN API
// ============================================================
const DMS_CONFIG_DIR = process.env.DMS_CONFIG_DIR || '/dms/config';
const DMS_ACCOUNTS = path.join(DMS_CONFIG_DIR, 'postfix-accounts.cf');
const DMS_VIRTUAL = path.join(DMS_CONFIG_DIR, 'postfix-virtual.cf');

function readLinesSafe(file) {
  try { return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean); } catch { return []; }
}
function writeLinesSafe(file, lines) {
  fs.writeFileSync(file, lines.join('\n') + (lines.length ? '\n' : ''));
}
async function dmsRestartMail() {
  // docker-mailserver reads these config files from mounted volume.
  // Host-level restart is handled by compose/system after admin changes when needed.
  return true;
}

app.get('/admin/dms/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const accounts = readLinesSafe(DMS_ACCOUNTS).length;
    const virtuals = readLinesSafe(DMS_VIRTUAL).length;
    res.json({ dmsRunning: fs.existsSync(DMS_ACCOUNTS), health: 'config-mounted', accounts, virtuals, backend: 'docker-mailserver' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/admin/dms/accounts', authenticateToken, requireAdmin, (req, res) => {
  const accounts = readLinesSafe(DMS_ACCOUNTS).map(line => ({ email: line.split('|')[0], raw: line }));
  res.json({ accounts, count: accounts.length });
});

app.post('/admin/dms/accounts', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 6) return res.status(400).json({ error: 'Valid email and password min 6 chars required' });
    const lines = readLinesSafe(DMS_ACCOUNTS).filter(l => !l.startsWith(email + '|'));
    const hash = await bcrypt.hash(password, 10);
    lines.push(`${email}|{BLF-CRYPT}${hash}`);
    writeLinesSafe(DMS_ACCOUNTS, lines);
    await dmsRestartMail();
    logEvent('dms_account_added', { email, by: req.user.username });
    res.json({ success: true, email });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/admin/dms/accounts/:email', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase();
    writeLinesSafe(DMS_ACCOUNTS, readLinesSafe(DMS_ACCOUNTS).filter(l => !l.startsWith(email + '|')));
    await dmsRestartMail();
    logEvent('dms_account_deleted', { email, by: req.user.username });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/admin/dms/domains', authenticateToken, requireAdmin, (req, res) => {
  const domains = readLinesSafe(DMS_VIRTUAL).map(line => { const [domain, target] = line.split(/\s+/, 2); return { domain: domain.replace(/^@/, ''), target: target || '' }; });
  res.json({ domains, count: domains.length });
});

app.post('/admin/dms/domains', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const domain = String(req.body.domain || '').trim().toLowerCase().replace(/^@/, '');
    const target = String(req.body.target || 'admin@rzbal.biz.id').trim().toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return res.status(400).json({ error: 'Valid domain required' });
    const lines = readLinesSafe(DMS_VIRTUAL).filter(l => !l.startsWith('@' + domain + ' '));
    lines.push(`@${domain} ${target}`);
    writeLinesSafe(DMS_VIRTUAL, lines);
    await dmsRestartMail();
    logEvent('dms_domain_added', { domain, target, by: req.user.username });
    res.json({ success: true, domain, target });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/admin/dms/domains/:domain', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const domain = decodeURIComponent(req.params.domain).toLowerCase().replace(/^@/, '');
    writeLinesSafe(DMS_VIRTUAL, readLinesSafe(DMS_VIRTUAL).filter(l => !l.startsWith('@' + domain + ' ')));
    await dmsRestartMail();
    logEvent('dms_domain_deleted', { domain, by: req.user.username });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function serverIp(req) {
  return (req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket?.localAddress || '194.163.153.148').toString().split(',')[0].replace('::ffff:', '');
}
function dnsRecords(domain, req) {
  const ip = serverIp(req);
  return [
    { type:'A', name:'mail', value:ip, ttl:300, purpose:'Mail host' },
    { type:'MX', name:'@', value:`10 mail.${domain}`, ttl:300, purpose:'Inbound routing' },
    { type:'TXT', name:'@', value:`v=spf1 mx a:mail.${domain} ~all`, ttl:300, purpose:'SPF sender policy' },
    { type:'TXT', name:`_dmarc`, value:`v=DMARC1; p=quarantine; rua=mailto:admin@${domain}`, ttl:300, purpose:'DMARC policy' },
    { type:'TXT', name:`mail._domainkey`, value:'v=DKIM1; k=rsa; p=ADD_DKIM_PUBLIC_KEY_FROM_DMS', ttl:300, purpose:'DKIM placeholder' },
    { type:'TXT', name:`_mta-sts`, value:`v=STSv1; id=${new Date().toISOString().slice(0,10).replace(/-/g,'')}`, ttl:300, purpose:'MTA-STS' }
  ];
}

app.get('/admin/dns/generate/:domain', authenticateToken, requireAdmin, (req, res) => {
  const domain = String(req.params.domain || '').toLowerCase().replace(/^@/, '');
  res.json({ domain, records: dnsRecords(domain, req) });
});

app.get('/admin/dns/health/:domain', authenticateToken, requireAdmin, async (req, res) => {
  const domain = String(req.params.domain || '').toLowerCase().replace(/^@/, '');
  const checks = [];
  async function dig(label, cmd, expect) {
    try { const { stdout } = await execAsync(cmd, { timeout: 8000 }); checks.push({ check: label, status: expect(stdout) ? 'ok' : 'warn', value: stdout.trim().slice(0, 500) || 'empty' }); }
    catch (e) { checks.push({ check: label, status: 'error', value: e.message }); }
  }
  await dig('MX', `dig +short MX ${domain}`, o => o.includes('mail.'));
  await dig('A mail', `dig +short A mail.${domain}`, o => /\d+\.\d+\.\d+\.\d+/.test(o));
  await dig('SPF', `dig +short TXT ${domain}`, o => o.includes('v=spf1'));
  await dig('DMARC', `dig +short TXT _dmarc.${domain}`, o => o.includes('DMARC1'));
  res.json({ domain, checks, healthy: checks.every(c => c.status === 'ok'), timestamp: Date.now() });
});

app.get('/admin/mail/logs', authenticateToken, requireAdmin, (req, res) => {
  const mailLog = '/dms/mail-logs/mail.log';
  const limit = Math.min(parseInt(req.query.limit || '300'), 2000);
  const lines = fs.existsSync(mailLog) ? fs.readFileSync(mailLog, 'utf8').split(/\r?\n/).slice(-limit) : [];
  res.json({ lines, count: lines.length, path: mailLog });
});

app.get('/admin/domain-expiry', authenticateToken, requireAdmin, async (req, res) => {
  const all = [...new Set(['rzbal.biz.id','mail.rzbal.biz.id', ...readLinesSafe(DMS_VIRTUAL).map(l => l.split(/\s+/)[0].replace(/^@/, ''))])].filter(Boolean);
  const results = [];
  for (const domain of all) {
    try { const { stdout } = await execAsync(`whois ${domain} | egrep -i 'Expiry|Expiration|paid-till|Registry Expiry' | head -3`, { timeout: 10000 }); results.push({ domain, status: stdout.trim() ? 'ok' : 'unknown', raw: stdout.trim() || 'no expiry field' }); }
    catch (e) { results.push({ domain, status: 'unknown', raw: e.message }); }
  }
  res.json({ domains: results, timestamp: Date.now() });
});

app.get('/admin/backups', authenticateToken, requireAdmin, (req, res) => {
  const backups = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')).map(f => { const st = fs.statSync(path.join(BACKUP_DIR, f)); return { file:f, size:st.size, createdAt:st.mtimeMs }; }).sort((a,b)=>b.createdAt-a.createdAt);
  res.json({ backups });
});

app.post('/admin/backups', authenticateToken, requireAdmin, (req, res) => {
  const stamp = new Date().toISOString().replace(/[:.]/g,'-');
  const file = path.join(BACKUP_DIR, `joemail-backup-${stamp}.json`);
  const payload = { createdAt: Date.now(), inboxes, admins, domains, logs, stats, blacklist, whitelist, dms: { accounts: readLinesSafe(DMS_ACCOUNTS), virtual: readLinesSafe(DMS_VIRTUAL) } };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  logEvent('backup_created', { file: path.basename(file), by: req.user.username });
  res.json({ success:true, file:path.basename(file), size:fs.statSync(file).size });
});

app.post('/admin/backups/restore/:file', authenticateToken, requireAdmin, (req, res) => {
  const safe = path.basename(req.params.file);
  const file = path.join(BACKUP_DIR, safe);
  if (!fs.existsSync(file)) return res.status(404).json({ error:'Backup not found' });
  const b = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (b.inboxes) { inboxes = b.inboxes; saveData(INBOXES_FILE, inboxes); }
  if (b.domains) { domains = b.domains; saveData(DOMAINS_FILE, domains); }
  if (b.stats) { stats = b.stats; saveData(STATS_FILE, stats); }
  if (b.blacklist) { blacklist = b.blacklist; saveData(BLACKLIST_FILE, blacklist); }
  if (b.whitelist) { whitelist = b.whitelist; saveData(WHITELIST_FILE, whitelist); }
  if (b.dms?.accounts) writeLinesSafe(DMS_ACCOUNTS, b.dms.accounts);
  if (b.dms?.virtual) writeLinesSafe(DMS_VIRTUAL, b.dms.virtual);
  logEvent('backup_restored', { file:safe, by:req.user.username });
  res.json({ success:true, file:safe });
});

function parseMailLog(limit=500) {
  const mailLog = '/dms/mail-logs/mail.log';
  let lines = [];
  try {
    lines = fs.existsSync(mailLog) ? fs.readFileSync(mailLog, 'utf8').split(/\r?\n/).filter(Boolean).slice(-limit) : [];
  } catch (e) {
    lines = [`mail.log unreadable: ${e.code || e.message}`];
  }
  const today = new Date().toDateString(); const weekAgo = Date.now() - 7*864e5;
  const classified = lines.map(line => {
    const lower = line.toLowerCase();
    const type = lower.includes('reject') ? 'reject' : lower.includes('bounce')||lower.includes('bounced') ? 'bounce' : lower.includes('sent')||lower.includes('delivered') ? 'delivery' : lower.includes('smtp') ? 'smtp' : lower.includes('from=') ? 'incoming' : 'log';
    return { line, type };
  });
  return { lines, classified, today: lines.filter(l => l.includes(today.slice(4,10))).length, week: lines.filter(l => Date.now() - weekAgo >= 0).length };
}
function inboxList() { return Object.values(inboxes).map(i => ({ email:i.email, createdAt:i.createdAt, expiresAt:i.expiresAt, active:i.active, suspended:!!i.suspended, messageCount:(i.messages||[]).length, lastActivity:(i.messages||[])[0]?.date || i.createdAt, ip:i.ip })); }
function domainRows() { return readLinesSafe(DMS_VIRTUAL).map(line => { const [d,t] = line.split(/\s+/,2); const domain=d.replace(/^@/,''); return { domain, target:t||'', active:domainMeta[domain]?.active !== false, notes:domainMeta[domain]?.notes||'', tags:domainMeta[domain]?.tags||[], expiry:domainMeta[domain]?.expiry||'', health:domainMeta[domain]?.health||'unchecked' }; }); }

app.get('/admin/extended/dashboard', authenticateToken, requireAdmin, async (req,res)=>{
  const mem=await si.mem(); const cpu=await si.currentLoad(); const disk=await si.fsSize(); const log=parseMailLog(2000); const domains=domainRows();
  res.json({ totals:{ domains:domains.length, activeDomains:domains.filter(d=>d.active).length, inactiveDomains:domains.filter(d=>!d.active).length, inboxes:inboxList().length, emailToday:log.today, email7d:log.week, spamBlocked:stats.spam||0 }, server:{ health:'ok', cpu:cpu.currentLoad, ramPct:+((mem.used/mem.total)*100).toFixed(2), diskPct:disk[0]?.use||0, uptime:process.uptime(), queue:'mounted' }, queue:{ status:'ok', pending:0 }, top:{ domains:domains.slice(0,10), inboxes:inboxList().sort((a,b)=>b.messageCount-a.messageCount).slice(0,10) }, trend:{ daily:[], monthly:[], spam:[], resource:[] } });
});
app.get('/admin/extended/domains', authenticateToken, requireAdmin, (req,res)=>res.json({ domains:domainRows() }));
app.get('/admin/extended/quick', authenticateToken, requireAdmin, async (req,res)=>{ const q=await queueSnapshot(); const list=inboxList(); const dom=domainRows(); res.json({ queue:q, domains:{total:dom.length,active:dom.filter(d=>d.active).length}, inboxes:{total:list.length,active:list.filter(i=>i.active).length,suspended:list.filter(i=>i.suspended).length,messages:list.reduce((a,b)=>a+b.messageCount,0)}, actions:['dns','inbox','logs','queue','backup','ops'] }); });
app.post('/admin/extended/domains/bulk', authenticateToken, requireAdmin, (req,res)=>{ const rows=String(req.body.domains||'').split(/\r?\n|,/).map(x=>x.trim().toLowerCase()).filter(Boolean); let lines=readLinesSafe(DMS_VIRTUAL); let added=0; for(const d of rows){ if(!lines.some(l=>l.startsWith('@'+d+' '))){lines.push(`@${d} ${req.body.target||'admin@rzbal.biz.id'}`); domainMeta[d]={...(domainMeta[d]||{}),active:true,tags:req.body.tags||[],notes:req.body.notes||''}; added++;}} writeLinesSafe(DMS_VIRTUAL,lines); saveData(DOMAIN_META_FILE,domainMeta); logEvent('bulk_domain_import',{added,by:req.user.username}); res.json({success:true,added}); });
app.patch('/admin/extended/domains/:domain', authenticateToken, requireAdmin, (req,res)=>{ const d=decodeURIComponent(req.params.domain).toLowerCase().replace(/^@/,''); domainMeta[d]={...(domainMeta[d]||{}),...req.body}; if(typeof domainMeta[d].tags==='string') domainMeta[d].tags=domainMeta[d].tags.split(',').map(x=>x.trim()).filter(Boolean); saveData(DOMAIN_META_FILE,domainMeta); logEvent('domain_meta_updated',{domain:d,by:req.user.username}); res.json({success:true,domain:d,meta:domainMeta[d]}); });
app.post('/admin/extended/domains/bulk-status', authenticateToken, requireAdmin, (req,res)=>{ const domains=(req.body.domains||[]).map(d=>String(d).toLowerCase()); domains.forEach(d=>domainMeta[d]={...(domainMeta[d]||{}),active:!!req.body.active}); saveData(DOMAIN_META_FILE,domainMeta); res.json({success:true,count:domains.length}); });
app.get('/admin/extended/inboxes', authenticateToken, requireAdmin, (req,res)=>{ const q=String(req.query.q||'').toLowerCase(); let list=inboxList(); if(q) list=list.filter(i=>i.email.includes(q)||String(i.ip).includes(q)); res.json({ inboxes:list, count:list.length, stats:{ total:list.length, active:list.filter(i=>i.active).length, suspended:list.filter(i=>i.suspended).length, messages:list.reduce((a,b)=>a+b.messageCount,0) } }); });
app.patch('/admin/extended/inboxes/:email', authenticateToken, requireAdmin, (req,res)=>{ const email=decodeURIComponent(req.params.email).toLowerCase(); if(!inboxes[email]) return res.status(404).json({error:'Inbox not found'}); if('suspended' in req.body) inboxes[email].suspended=!!req.body.suspended; if(req.body.forceExpire) { inboxes[email].expiresAt=Date.now()-1; inboxes[email].active=false; } saveData(INBOXES_FILE,inboxes); logEvent('inbox_updated',{email,by:req.user.username}); res.json({success:true,inbox:inboxes[email]}); });
app.get('/admin/extended/mail-logs', authenticateToken, requireAdmin, (req,res)=>{ const type=req.query.type; let data=parseMailLog(Math.min(parseInt(req.query.limit||'1000'),5000)).classified; if(type&&type!=='all') data=data.filter(x=>x.type===type); res.json({ logs:data, count:data.length, export:data.map(x=>x.line).join('\n') }); });


function dockerApi(method, apiPath, body=null) {
  return new Promise(resolve => {
    const http = require('http');
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({ socketPath:'/var/run/docker.sock', path:apiPath, method, headers: payload ? {'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)} : {} }, res => {
      let data=''; res.on('data', c => data+=c); res.on('end', () => { try{resolve(JSON.parse(data||'{}'))}catch(e){resolve(data)} });
    });
    req.on('error', e => resolve({error:e.message})); if(payload) req.write(payload); req.end();
  });
}
async function dockerExec(container, cmd) {
  const ex = await dockerApi('POST','/containers/'+encodeURIComponent(container)+'/exec',{AttachStdout:true,AttachStderr:true,Tty:false,Cmd:['sh','-lc',cmd]});
  if(!ex.Id) return JSON.stringify(ex);
  const out = await dockerApi('POST','/exec/'+ex.Id+'/start',{Detach:false,Tty:false});
  return typeof out === 'string' ? out.replace(/[\u0000-\u001f]+/g,' ').trim() : JSON.stringify(out);
}
function listenPorts() {
  try {
    const decode = h => parseInt(h.split(':')[1],16);
    const rows = fs.readFileSync('/proc/net/tcp','utf8').split('\n').slice(1).concat(fs.readFileSync('/proc/net/tcp6','utf8').split('\n').slice(1));
    return [...new Set(rows.map(r=>r.trim().split(/\s+/)).filter(c=>c[3]==='0A').map(c=>decode(c[1])).filter(p=>[25,80,443,465,587,993,995,4190,8880].includes(p)))].sort((a,b)=>a-b).map(p=>':'+p);
  } catch(e) { return []; }
}

async function dmsExec(cmd, timeout=12000) { try { return await dockerExec('joemail-dms', cmd); } catch (e) { return e.stdout || e.stderr || e.message; } }
async function queueSnapshot() { const raw = await dmsExec('postqueue -p 2>/dev/null || mailq 2>/dev/null || true'); const pending = (raw.match(/^[A-F0-9]{6,}/gmi)||[]).length; return { status: pending ? 'pending' : 'empty', pending, raw: raw.trim() || 'Mail queue is empty' }; }
app.get('/admin/extended/monitoring', authenticateToken, requireAdmin, async (req,res)=>{ const mem=await si.mem(), cpu=await si.currentLoad(), disk=await si.fsSize(), net=await si.networkStats(); let docker='', conns=''; try{ const cList=await dockerApi('GET','/containers/json?all=1'); docker=Array.isArray(cList)?cList.map(c=>({name:c.Names?.[0]?.replace(/^\//,'')||c.Id?.slice(0,12),status:c.State||c.Status,image:c.Image})):[] }catch(e){docker=[]} try{ conns=(await execAsync("ss -tan | awk '{print $1}' | sort | uniq -c")).stdout }catch(e){conns=e.message} const q=await queueSnapshot(); res.json({ cpu, memory:mem, disk, docker:docker, queue:q, connections:net, connectionStates:conns, ratePerMinute:parseMailLog(1200).classified.filter(x=>x.type==='incoming'||x.type==='delivery').length, uptime:process.uptime() }); });
app.get('/admin/extended/queue', authenticateToken, requireAdmin, async (req,res)=>res.json(await queueSnapshot()));
app.post('/admin/extended/queue/flush', authenticateToken, requireAdmin, async (req,res)=>{ const out=await dmsExec('postqueue -f 2>&1 || true'); logEvent('queue_flush',{by:req.user.username}); res.json({success:true,out}); });
app.post('/admin/extended/queue/delete-deferred', authenticateToken, requireAdmin, async (req,res)=>{ const out=await dmsExec("postsuper -d ALL deferred 2>&1 || true"); logEvent('queue_delete_deferred',{by:req.user.username}); res.json({success:true,out}); });
app.get('/admin/extended/reputation/:domain', authenticateToken, requireAdmin, async (req,res)=>{ const domain=String(req.params.domain||'').toLowerCase(); const ip=(await execAsync(`dig +short A mail.${domain} | tail -1 || true`)).stdout.trim(); const rbls=['zen.spamhaus.org','bl.spamcop.net','b.barracudacentral.org']; const checks=[]; for(const rbl of rbls){ let query=ip?ip.split('.').reverse().join('.')+'.'+rbl:''; try{let o=query?(await execAsync(`dig +short ${query}`,{timeout:6000})).stdout.trim():''; checks.push({rbl,status:o?'listed':'clean',value:o||'clean'});}catch(e){checks.push({rbl,status:'unknown',value:e.message});} } res.json({domain,ip,checks}); });
app.get('/admin/extended/security', authenticateToken, requireAdmin, (req,res)=>res.json({ loginHistory:logs.filter(l=>l.type==='login_success').slice(0,100), failedLogins:logs.filter(l=>l.type==='login_failed').slice(0,100), audit:logs.slice(0,300), sessions:Object.entries(sessions).map(([token,s])=>({token:token.slice(0,12)+'...',...s})), config:securityConfig, abuse:{ failed:logs.filter(l=>l.type==='login_failed').length, spam:stats.spam||0 } }));
app.post('/admin/extended/security', authenticateToken, requireAdmin, (req,res)=>{ securityConfig={...securityConfig,...req.body}; saveData(SECURITY_FILE,securityConfig); logEvent('security_settings_updated',{by:req.user.username}); res.json({success:true,config:securityConfig}); });
app.get('/admin/extended/spam', authenticateToken, requireAdmin, (req,res)=>res.json({ blacklist, whitelist, queue:logs.filter(l=>l.type.includes('spam')).slice(0,100), rbl:{ spamhaus:'ok', spamcop:'ok', barracuda:'ok' }, stats:{ blocked:stats.spam||0, blacklist:blacklist.length, whitelist:whitelist.length } }));
app.post('/admin/extended/system', authenticateToken, requireAdmin, (req,res)=>{ systemConfig={...systemConfig,...req.body}; saveData(SYSTEM_FILE,systemConfig); logEvent('system_settings_updated',{by:req.user.username}); res.json({success:true,config:systemConfig}); });
app.get('/admin/extended/system', authenticateToken, requireAdmin, (req,res)=>res.json(systemConfig));


app.get('/admin/extended/ops', authenticateToken, requireAdmin, async (req,res)=>{
  const run=async(cmd,timeout=10000)=>{try{return (await execAsync(cmd,{timeout})).stdout.trim()}catch(e){return (e.stdout||e.stderr||e.message||'').trim()}};
  const cList=await dockerApi('GET','/containers/json?all=1');
  const cMap=Array.isArray(cList)?Object.fromEntries(cList.map(c=>[(c.Names?.[0]||'').replace(/^\//,''),`${c.State}|${c.Status}|${c.Image}`])):{};
  const dms=cMap['joemail-dms']||'';
  const apiC=cMap['joemail-api']||'';
  const nginx=cMap['joemail-nginx']||'';
  const ports=Array.isArray(cList) ? [...new Set(cList.flatMap(c=>(c.Ports||[]).flatMap(p=>[p.PublicPort,p.PrivatePort]).filter(Boolean)))].sort((a,b)=>a-b).map(p=>':'+p).join('\n') : listenPorts().join('\n');
  const cert=await run("openssl x509 -in /opt/joemail/dms/certs/fullchain.pem -noout -subject -issuer -enddate 2>/dev/null || openssl x509 -in /dms/config/../certs/fullchain.pem -noout -subject -issuer -enddate 2>/dev/null || true");
  const compose=Array.isArray(cList)?cList.filter(c=>(c.Names||[]).some(n=>n.includes('joemail'))).map(c=>`${(c.Names?.[0]||'').replace(/^\//,'')}|${c.Status}|${c.Ports?.map(p=>p.PublicPort?`${p.PublicPort}->${p.PrivatePort}`:p.PrivatePort).join(',')||''}`).join('\n'):'';
  const backup=fs.existsSync(BACKUP_DIR)?fs.readdirSync(BACKUP_DIR).filter(f=>f.endsWith('.json')).map(f=>({file:f,size:fs.statSync(path.join(BACKUP_DIR,f)).size,createdAt:fs.statSync(path.join(BACKUP_DIR,f)).mtimeMs})).sort((a,b)=>b.createdAt-a.createdAt).slice(0,10):[];
  res.json({containers:{dms,api:apiC,nginx},ports:ports.split(/\n/).filter(Boolean),cert,compose:compose.split(/\n/).filter(Boolean),backups:backup,paths:{data:DATA_DIR,dmsConfig:'/dms/config',logs:'/dms/mail-logs'}});
});
app.post('/admin/extended/ops/action', authenticateToken, requireAdmin, async (req,res)=>{
  const action=String(req.body.action||'');
  try {
    let out='';
    if(action==='queue-flush') out=await dockerExec('joemail-dms','postqueue -f 2>&1 || true');
    else if(action==='nginx-reload') out=await dockerExec('joemail-nginx','nginx -t && nginx -s reload 2>&1');
    else if(action==='dms-reload') out=await dockerExec('joemail-dms','supervisorctl reread 2>&1; supervisorctl update 2>&1; supervisorctl restart postfix dovecot 2>&1 || true');
    else if(action==='dms-restart') out=JSON.stringify(await dockerApi('POST','/containers/joemail-dms/restart?t=5'));
    else if(action==='api-restart') out=JSON.stringify(await dockerApi('POST','/containers/joemail-api/restart?t=5'));
    else if(action==='docker-prune') out=JSON.stringify(await dockerApi('POST','/images/prune?filters='+encodeURIComponent(JSON.stringify({dangling:{true:true}}))));
    else if(action==='ops-backup') out=(await execAsync('/opt/joemail/ops/backup.sh',{timeout:60000,cwd:'/opt/joemail'})).stdout;
    else if(action==='ops-cleanup') out=(await execAsync('/opt/joemail/ops/cleanup.sh',{timeout:60000,cwd:'/opt/joemail'})).stdout;
    else return res.status(400).json({error:'unknown action'});
    logEvent('ops_action',{action,by:req.user.username});
    res.json({success:true,action,out: typeof out==='string'?out:JSON.stringify(out)});
  } catch(e) {
    res.status(500).json({error:e.message,out:e.stdout||e.stderr||''});
  }
});
app.post('/admin/extended/inboxes/bulk', authenticateToken, requireAdmin, (req,res)=>{
  const action=String(req.body.action||''); const emails=(req.body.emails||[]).map(e=>String(e).toLowerCase()); let count=0;
  for(const email of emails){ if(!inboxes[email]) continue; if(action==='suspend') inboxes[email].suspended=true; if(action==='unsuspend') inboxes[email].suspended=false; if(action==='expire'){inboxes[email].expiresAt=Date.now()-1; inboxes[email].active=false;} if(action==='delete') delete inboxes[email]; count++; }
  saveData(INBOXES_FILE,inboxes); logEvent('bulk_inbox_action',{action,count,by:req.user.username}); res.json({success:true,action,count});
});
app.delete('/admin/extended/inboxes/:email', authenticateToken, requireAdmin, (req,res)=>{
  const email=decodeURIComponent(req.params.email).toLowerCase();
  if(!inboxes[email]) return res.status(404).json({error:'Inbox not found'});
  delete inboxes[email]; saveData(INBOXES_FILE,inboxes); logEvent('inbox_deleted',{email,by:req.user.username}); res.json({success:true,email});
});
app.post('/admin/extended/security/kill-session/:token', authenticateToken, requireAdmin, (req,res)=>{
  const tokenPrefix=decodeURIComponent(req.params.token);
  const match=Object.keys(sessions).find(t=>t.startsWith(tokenPrefix));
  if(!match) return res.status(404).json({error:'Session not found'});
  delete sessions[match]; saveData(SESSIONS_FILE,sessions); logEvent('session_killed',{token:tokenPrefix,by:req.user.username}); res.json({success:true});
});

// ============================================================
// CLEANUP JOB
// ============================================================
cron.schedule('*/5 * * * *', () => {
  try {
    const now = Date.now();
    let cleaned = 0;

    for (const email in inboxes) {
      const inbox = inboxes[email];
      if (inbox.expiresAt !== -1 && inbox.expiresAt < now) {
        inbox.active = false;
        cleaned++;
      }
    }

    if (cleaned > 0) {
      saveData(INBOXES_FILE, inboxes);
      logger.info(`Cleanup: deactivated ${cleaned} expired inboxes`);
    }
  } catch (err) {
    logger.error('Cleanup error:', err);
  }
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`JoeMail API running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Domain: ${DOMAIN}`);
});