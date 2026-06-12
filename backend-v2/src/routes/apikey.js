const express = require('express');
const router = express.Router();
const { getDatabase } = require('../utils/db');
const { generateApiKey, hashApiKey, maskApiKey, getExpiryDate } = require('../utils/helpers');
const { adminAuthMiddleware } = require('../middleware/auth');
const logger = require('../utils/logger');

router.post('/create', adminAuthMiddleware, (req, res) => {
  try {
    if (process.env.API_KEYS_ENABLED !== 'true') return res.status(403).json({ success: false, message: 'API keys are disabled' });
    const { name, permissions, rateLimit, expiresInHours, ipWhitelist } = req.body;
    const apiKey = generateApiKey();
    const keyHash = hashApiKey(apiKey);
    const keyId = `key_${Date.now()}`;
    const now = new Date().toISOString();
    const expiresAt = expiresInHours ? getExpiryDate(expiresInHours) : null;
    const db = getDatabase();
    db.prepare(`INSERT INTO api_keys (key_id, key_hash, name, permissions, rate_limit, expires_at, ip_whitelist) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(keyId, keyHash, name || 'Unnamed', permissions || 'read', rateLimit || 1000, expiresAt, ipWhitelist || null);
    logger.info(`[APIKEY] Created: ${keyId}`);
    res.json({ success: true, data: { keyId, apiKey, name: name || 'Unnamed', permissions: permissions || 'read', expiresAt, warning: 'Store this API key securely - it will not be shown again!' } });
  } catch (error) { logger.error('[APIKEY] Create error:', error); res.status(500).json({ success: false, message: 'Failed to create API key' }); }
});

router.get('/list', adminAuthMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const keys = db.prepare('SELECT id, key_id, name, permissions, rate_limit, request_count, is_active, created_at, expires_at, last_used, ip_whitelist FROM api_keys ORDER BY created_at DESC').all();
    res.json({ success: true, data: { keys: keys.map(k => ({ id: k.id, keyId: k.key_id, name: k.name, permissions: k.permissions, rateLimit: k.rate_limit, requestCount: k.request_count, isActive: !!k.is_active, createdAt: k.created_at, expiresAt: k.expires_at, lastUsed: k.last_used, ipWhitelist: k.ip_whitelist })) } });
  } catch (error) { logger.error('[APIKEY] List error:', error); res.status(500).json({ success: false, message: 'Failed to list API keys' }); }
});

router.delete('/:id', adminAuthMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();
    db.prepare('UPDATE api_keys SET is_active = 0 WHERE id = ?').run(id);
    logger.info(`[APIKEY] Revoked: ${id}`);
    res.json({ success: true, message: 'API key revoked' });
  } catch (error) { logger.error('[APIKEY] Delete error:', error); res.status(500).json({ success: false, message: 'Failed to revoke API key' }); }
});

module.exports = router;
