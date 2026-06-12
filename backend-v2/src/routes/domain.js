const express = require('express');
const router = express.Router();
const { getDatabase } = require('../utils/db');
const { generateVerificationRecord, getTodayDate } = require('../utils/helpers');
const { validateDomain } = require('../middleware/validate');
const logger = require('../utils/logger');

router.post('/register', validateDomain, (req, res) => {
  try {
    const { domain, userId } = req.body;
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM custom_domains WHERE domain = ?').get(domain.toLowerCase());
    if (existing) return res.status(409).json({ success: false, message: 'Domain already registered' });
    const verificationRecord = generateVerificationRecord(domain);
    db.prepare(`INSERT INTO custom_domains (domain, user_id, verification_record, settings) VALUES (?, ?, ?, ?)`).run(domain.toLowerCase(), userId || null, verificationRecord, JSON.stringify({}));
    logger.info(`[DOMAIN] Registered: ${domain}`);
    res.json({ success: true, data: { domain, verificationRecord, instructions: `Add TXT record: ${verificationRecord} to ${domain}` } });
  } catch (error) { logger.error('[DOMAIN] Register error:', error); res.status(500).json({ success: false, message: 'Failed to register domain' }); }
});

router.get('/verify/:domain', (req, res) => {
  try {
    const { domain } = req.params;
    const db = getDatabase();
    const domainRecord = db.prepare('SELECT * FROM custom_domains WHERE domain = ?').get(domain.toLowerCase());
    if (!domainRecord) return res.status(404).json({ success: false, message: 'Domain not found' });
    if (domainRecord.is_verified) return res.json({ success: true, data: { verified: true, domain, verifiedAt: domainRecord.verified_at } });
    res.json({ success: true, data: { verified: false, domain, verificationRecord: domainRecord.verification_record, instructions: `Add TXT record: ${domainRecord.verification_record} to ${domain}` } });
  } catch (error) { logger.error('[DOMAIN] Verify error:', error); res.status(500).json({ success: false, message: 'Failed to verify domain' }); }
});

router.post('/verify/:domain', (req, res) => {
  try {
    const { domain } = req.params;
    const db = getDatabase();
    const domainRecord = db.prepare('SELECT * FROM custom_domains WHERE domain = ?').get(domain.toLowerCase());
    if (!domainRecord) return res.status(404).json({ success: false, message: 'Domain not found' });
    if (domainRecord.is_verified) return res.json({ success: true, data: { verified: true, domain } });
    const now = new Date().toISOString();
    db.prepare('UPDATE custom_domains SET is_verified = 1, verified_at = ? WHERE id = ?').run(now, domainRecord.id);
    const today = getTodayDate();
    const stats = db.prepare('SELECT * FROM stats WHERE date = ?').get(today);
    if (stats) db.prepare('UPDATE stats SET custom_domains_added = custom_domains_added + 1 WHERE date = ?').run(today);
    else db.prepare('INSERT INTO stats (date, custom_domains_added) VALUES (?, 1)').run(today);
    logger.info(`[DOMAIN] Verified: ${domain}`);
    res.json({ success: true, data: { verified: true, domain, verifiedAt: now } });
  } catch (error) { logger.error('[DOMAIN] Verify confirm error:', error); res.status(500).json({ success: false, message: 'Failed to verify domain' }); }
});

router.get('/list', (req, res) => {
  try {
    const db = getDatabase();
    const domains = db.prepare('SELECT domain, is_verified, is_active, created_at, verified_at FROM custom_domains WHERE is_active = 1 ORDER BY created_at DESC').all();
    const result = domains.map(d => ({ domain: d.domain, verified: !!d.is_verified, active: !!d.is_active, createdAt: d.created_at, verifiedAt: d.verified_at }));

    // Always include built-in domain(s) from ALLOWED_DOMAINS env
    const builtInDomains = (process.env.ALLOWED_DOMAINS || '').split(',').map(d => d.trim()).filter(Boolean);
    for (const builtIn of builtInDomains) {
      if (!result.find(d => d.domain === builtIn)) {
        result.unshift({ domain: builtIn, verified: true, active: true, createdAt: null, verifiedAt: null });
      }
    }

    res.json({ success: true, data: { domains: result } });
  } catch (error) { logger.error('[DOMAIN] List error:', error); res.status(500).json({ success: false, message: 'Failed to list domains' }); }
});

router.delete('/:domain', (req, res) => {
  try {
    const { domain } = req.params;
    const db = getDatabase();
    db.prepare('UPDATE custom_domains SET is_active = 0 WHERE domain = ?').run(domain.toLowerCase());
    logger.info(`[DOMAIN] Deactivated: ${domain}`);
    res.json({ success: true, message: 'Domain deactivated' });
  } catch (error) { logger.error('[DOMAIN] Delete error:', error); res.status(500).json({ success: false, message: 'Failed to delete domain' }); }
});

module.exports = router;
