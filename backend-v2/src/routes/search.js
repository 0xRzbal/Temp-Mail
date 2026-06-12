const express = require('express');
const router = express.Router();
const { getDatabase } = require('../utils/db');
const { validateSearch } = require('../middleware/validate');
const { formatEmailSize } = require('../utils/helpers');
const logger = require('../utils/logger');

router.get('/', validateSearch, (req, res) => {
  try {
    const { q, email, page = 1, limit = 20 } = req.query;
    const db = getDatabase();
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const now = new Date().toISOString();

    let results;
    if (email) {
      results = db.prepare(`SELECT e.id, e.from_address, e.from_name, e.subject, e.body_text, e.created_at, e.size, e.category, e.is_read FROM email_search es JOIN emails e ON es.email_id = e.id WHERE email_search MATCH ? AND e.email_address = ? AND e.is_deleted = 0 AND e.expires_at > ? ORDER BY rank LIMIT ? OFFSET ?`).all(q, email, now, parseInt(limit), offset);
    } else {
      results = db.prepare(`SELECT e.id, e.email_address, e.from_address, e.from_name, e.subject, e.body_text, e.created_at, e.size, e.category, e.is_read FROM email_search es JOIN emails e ON es.email_id = e.id WHERE email_search MATCH ? AND e.is_deleted = 0 AND e.expires_at > ? ORDER BY rank LIMIT ? OFFSET ?`).all(q, now, parseInt(limit), offset);
    }

    res.json({ success: true, data: { query: q, results: results.map(r => ({ id: r.id, email: r.email_address, from: r.from_address, fromName: r.from_name, subject: r.subject, preview: r.body_text ? r.body_text.substring(0, 200) : '', date: r.created_at, size: formatEmailSize(r.size || 0), category: r.category || 'inbox', isRead: !!r.is_read })), pagination: { page: parseInt(page), limit: parseInt(limit), total: results.length } } });
  } catch (error) { logger.error('[SEARCH] Error:', error); res.status(500).json({ success: false, message: 'Search failed' }); }
});

module.exports = router;
