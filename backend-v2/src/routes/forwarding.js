const express = require('express');
const router = express.Router();
const { getDatabase } = require('../utils/db');
const { getExpiryDate, getTodayDate } = require('../utils/helpers');
const { validateForwarding } = require('../middleware/validate');
const logger = require('../utils/logger');

router.post('/create', validateForwarding, (req, res) => {
  try {
    if (process.env.FORWARDING_ENABLED !== 'true') return res.status(403).json({ success: false, message: 'Forwarding is disabled' });
    const { tempEmail, forwardTo } = req.body;
    const db = getDatabase();
    const existingRules = db.prepare('SELECT COUNT(*) as count FROM forwarding_rules WHERE temp_email = ? AND is_active = 1').get(tempEmail);
    const maxPerEmail = parseInt(process.env.FORWARDING_MAX_PER_EMAIL) || 5;
    if (existingRules.count >= maxPerEmail) return res.status(400).json({ success: false, message: `Maximum ${maxPerEmail} forwarding rules per email` });
    const now = new Date().toISOString();
    const expiresAt = getExpiryDate(24);
    db.prepare(`INSERT INTO forwarding_rules (temp_email, forward_to, created_at, expires_at) VALUES (?, ?, ?, ?)`).run(tempEmail, forwardTo, now, expiresAt);
    logger.info(`[FORWARDING] Created: ${tempEmail} -> ${forwardTo}`);
    res.json({ success: true, data: { tempEmail, forwardTo, createdAt: now, expiresAt } });
  } catch (error) { logger.error('[FORWARDING] Create error:', error); res.status(500).json({ success: false, message: 'Failed to create forwarding rule' }); }
});

router.get('/:email', (req, res) => {
  try {
    const { email } = req.params;
    const db = getDatabase();
    const rules = db.prepare('SELECT * FROM forwarding_rules WHERE temp_email = ? AND is_active = 1 ORDER BY created_at DESC').all(email);
    res.json({ success: true, data: { rules: rules.map(r => ({ id: r.id, forwardTo: r.forward_to, forwardCount: r.forward_count, maxForwards: r.max_forwards, createdAt: r.created_at, lastForwarded: r.last_forwarded })) } });
  } catch (error) { logger.error('[FORWARDING] List error:', error); res.status(500).json({ success: false, message: 'Failed to fetch forwarding rules' }); }
});

router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();
    db.prepare('UPDATE forwarding_rules SET is_active = 0 WHERE id = ?').run(id);
    logger.info(`[FORWARDING] Deleted rule: ${id}`);
    res.json({ success: true, message: 'Forwarding rule deleted' });
  } catch (error) { logger.error('[FORWARDING] Delete error:', error); res.status(500).json({ success: false, message: 'Failed to delete forwarding rule' }); }
});

module.exports = router;
