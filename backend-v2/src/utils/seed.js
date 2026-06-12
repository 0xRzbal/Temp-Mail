require('dotenv').config();
const { getDatabase } = require('./db');
const { generateEmailAddress, generateToken, getExpiryDate, generateApiKey, hashApiKey } = require('./helpers');
const logger = require('./logger');

function seed() {
  const db = getDatabase();
  const now = new Date().toISOString();
  const expiresAt = getExpiryDate(24);
  const domain = 'mail.rzbal.biz.id';

  for (let i = 0; i < 5; i++) {
    const email = generateEmailAddress(domain);
    const token = generateToken();
    try {
      db.prepare(`INSERT INTO temp_addresses (email_address, token, created_at, expires_at, last_accessed) VALUES (?, ?, ?, ?, ?)`).run(email, token, now, expiresAt, now);
      logger.info(`[SEED] Created temp address: ${email}`);
    } catch (e) {}
  }

  const apiKey = generateApiKey();
  const keyHash = hashApiKey(apiKey);
  try {
    db.prepare(`INSERT INTO api_keys (key_id, key_hash, name, permissions, rate_limit) VALUES (?, ?, ?, ?, ?)`).run('demo-key-1', keyHash, 'Demo Key', 'read,write,delete', 1000);
    logger.info(`[SEED] API Key (save this!): ${apiKey}`);
  } catch (e) {}

  try {
    db.prepare(`INSERT INTO webhooks (url, secret, events) VALUES (?, ?, ?)`).run('https://example.com/webhook', 'demo-secret', 'email.received,email.deleted');
    logger.info(`[SEED] Created demo webhook`);
  } catch (e) {}

  logger.info('[SEED] Database seeded successfully!');
}

seed();
