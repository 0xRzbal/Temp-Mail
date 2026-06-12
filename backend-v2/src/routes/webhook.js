const express = require('express');
const router = express.Router();
const { getDatabase } = require('../utils/db');
const { validateWebhook } = require('../middleware/validate');
const { adminAuthMiddleware } = require('../middleware/auth');
const logger = require('../utils/logger');

router.post('/create', adminAuthMiddleware, validateWebhook, (req, res) => {
  try {
    if (process.env.WEBHOOKS_ENABLED !== 'true') return res.status(403).json({ success: false, message: 'Webhooks are disabled' });
    const { url, secret, events } = req.body;
    const db = getDatabase();
    const eventsStr = events || 'email.received';
    db.prepare(`INSERT INTO webhooks (url, secret, events) VALUES (?, ?, ?)`).run(url, secret || null, eventsStr);
    logger.info(`[WEBHOOK] Created: ${url}`);
    res.json({ success: true, data: { url, events: eventsStr } });
  } catch (error) { logger.error('[WEBHOOK] Create error:', error); res.status(500).json({ success: false, message: 'Failed to create webhook' }); }
});

router.get('/list', adminAuthMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const webhooks = db.prepare('SELECT * FROM webhooks ORDER BY created_at DESC').all();
    res.json({ success: true, data: { webhooks: webhooks.map(w => ({ id: w.id, url: w.url, events: w.events, isActive: !!w.is_active, successCount: w.success_count, failureCount: w.failure_count, lastTriggered: w.last_triggered })) } });
  } catch (error) { logger.error('[WEBHOOK] List error:', error); res.status(500).json({ success: false, message: 'Failed to list webhooks' }); }
});

router.get('/deliveries/:id', adminAuthMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();
    const deliveries = db.prepare('SELECT * FROM webhook_deliveries WHERE webhook_id = ? ORDER BY delivered_at DESC LIMIT 50').all(id);
    res.json({ success: true, data: { deliveries: deliveries.map(d => ({ id: d.id, event: d.event, responseStatus: d.response_status, deliveredAt: d.delivered_at, retryCount: d.retry_count, isSuccess: !!d.is_success })) } });
  } catch (error) { logger.error('[WEBHOOK] Deliveries error:', error); res.status(500).json({ success: false, message: 'Failed to fetch deliveries' }); }
});

router.delete('/:id', adminAuthMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();
    db.prepare('UPDATE webhooks SET is_active = 0 WHERE id = ?').run(id);
    logger.info(`[WEBHOOK] Deleted: ${id}`);
    res.json({ success: true, message: 'Webhook deleted' });
  } catch (error) { logger.error('[WEBHOOK] Delete error:', error); res.status(500).json({ success: false, message: 'Failed to delete webhook' }); }
});

module.exports = router;
