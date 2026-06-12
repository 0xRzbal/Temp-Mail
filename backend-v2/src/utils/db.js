const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../database/joemail.db');
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

let db;

function getDatabase() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = 10000');
  }
  return db;
}

function initDatabase() {
  const database = getDatabase();

  database.exec(`CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_address TEXT NOT NULL,
    from_address TEXT,
    from_name TEXT,
    to_address TEXT,
    subject TEXT,
    body_text TEXT,
    body_html TEXT,
    headers TEXT,
    attachments TEXT,
    size INTEGER DEFAULT 0,
    is_read INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    is_forwarded INTEGER DEFAULT 0,
    is_replied INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    message_id TEXT,
    ip_address TEXT,
    spam_score REAL DEFAULT 0,
    category TEXT DEFAULT 'inbox'
  )`);

  database.exec(`CREATE TABLE IF NOT EXISTS temp_addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_address TEXT UNIQUE NOT NULL,
    token TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    last_accessed DATETIME,
    access_count INTEGER DEFAULT 0,
    ip_address TEXT,
    theme_preference TEXT DEFAULT 'dark',
    is_active INTEGER DEFAULT 1
  )`);

  database.exec(`CREATE TABLE IF NOT EXISTS custom_domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT UNIQUE NOT NULL,
    user_id TEXT,
    verification_method TEXT DEFAULT 'txt',
    verification_record TEXT,
    is_verified INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    verified_at DATETIME,
    settings TEXT
  )`);

  database.exec(`CREATE TABLE IF NOT EXISTS forwarding_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temp_email TEXT NOT NULL,
    forward_to TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    forward_count INTEGER DEFAULT 0,
    max_forwards INTEGER DEFAULT 5,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    last_forwarded DATETIME,
    UNIQUE(temp_email, forward_to)
  )`);

  database.exec(`CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_id TEXT UNIQUE NOT NULL,
    key_hash TEXT NOT NULL,
    name TEXT,
    permissions TEXT DEFAULT 'read',
    rate_limit INTEGER DEFAULT 1000,
    request_count INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    last_used DATETIME,
    ip_whitelist TEXT
  )`);

  database.exec(`CREATE TABLE IF NOT EXISTS webhooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    secret TEXT,
    events TEXT DEFAULT 'email.received',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_triggered DATETIME,
    failure_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0
  )`);

  database.exec(`CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    webhook_id INTEGER,
    event TEXT,
    payload TEXT,
    response_status INTEGER,
    response_body TEXT,
    delivered_at DATETIME,
    retry_count INTEGER DEFAULT 0,
    is_success INTEGER DEFAULT 0
  )`);

  database.exec(`CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  )`);

  database.exec(`CREATE TABLE IF NOT EXISTS stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE NOT NULL,
    emails_received INTEGER DEFAULT 0,
    emails_deleted INTEGER DEFAULT 0,
    emails_forwarded INTEGER DEFAULT 0,
    emails_replied INTEGER DEFAULT 0,
    addresses_created INTEGER DEFAULT 0,
    addresses_deleted INTEGER DEFAULT 0,
    api_requests INTEGER DEFAULT 0,
    webhooks_triggered INTEGER DEFAULT 0,
    custom_domains_added INTEGER DEFAULT 0
  )`);

  database.exec(`CREATE TABLE IF NOT EXISTS replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_id INTEGER,
    from_address TEXT,
    to_address TEXT,
    subject TEXT,
    body TEXT,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'sent',
    error_message TEXT
  )`);

  // FTS5 Search (standalone, not content-synced)
  database.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS email_search USING fts5(
    email_id, subject, body_text, from_address
  )`);

  database.exec(`CREATE TRIGGER IF NOT EXISTS emails_ai AFTER INSERT ON emails BEGIN
    INSERT INTO email_search(email_id, subject, body_text, from_address)
    VALUES (new.id, new.subject, new.body_text, new.from_address);
  END`);

  database.exec(`CREATE TRIGGER IF NOT EXISTS emails_ad AFTER DELETE ON emails BEGIN
    DELETE FROM email_search WHERE email_id = old.id;
  END`);

  database.exec(`CREATE TRIGGER IF NOT EXISTS emails_au AFTER UPDATE ON emails BEGIN
    DELETE FROM email_search WHERE email_id = old.id;
    INSERT INTO email_search(email_id, subject, body_text, from_address)
    VALUES (new.id, new.subject, new.body_text, new.from_address);
  END`);

  // Indexes
  database.exec(`CREATE INDEX IF NOT EXISTS idx_emails_email ON emails(email_address)`);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_emails_created ON emails(created_at)`);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_emails_expires ON emails(expires_at)`);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_emails_category ON emails(category)`);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_temp_address ON temp_addresses(email_address)`);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_temp_expires ON temp_addresses(expires_at)`);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_custom_domains ON custom_domains(domain)`);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_forwarding ON forwarding_rules(temp_email)`);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_api_keys ON api_keys(key_id)`);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_stats_date ON stats(date)`);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_replies_email ON replies(email_id)`);

  // Default admin
  const defaultAdmin = database.prepare('SELECT * FROM admin_users WHERE username = ?').get('admin');
  if (!defaultAdmin) {
    const bcrypt = require('bcryptjs');
    const hash = process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync('admin123', 10);
    database.prepare('INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)')
      .run('admin', hash, 'superadmin');
    logger.info('[DB] Default admin user created');
  }

  logger.info('[DB] All tables, indexes, and triggers created');

  // Migrations
  try {
    const cols = database.prepare("PRAGMA table_info(stats)").all().map(c => c.name);
    if (!cols.includes('addresses_deleted')) {
      database.exec('ALTER TABLE stats ADD COLUMN addresses_deleted INTEGER DEFAULT 0');
      logger.info('[DB] Migration: added addresses_deleted to stats');
    }
  } catch (e) { logger.warn('[DB] Migration check failed:', e.message); }
}

function close() {
  if (db) { db.close(); db = null; }
}

module.exports = { getDatabase, initDatabase, close };
