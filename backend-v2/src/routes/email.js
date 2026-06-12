const express = require('express');
const router = express.Router();
const { getDatabase } = require('../utils/db');
const { generateEmailAddress, generateToken, getExpiryDate, formatEmailSize, sanitizeInput, getTodayDate, parseAllowedDomains } = require('../utils/helpers');
const { generateToken: generateJwtToken } = require('../middleware/auth');
const { validateEmailParam, validateCreateEmail } = require('../middleware/validate');
const sanitizeHtml = require('sanitize-html');
const logger = require('../utils/logger');

router.post('/create', validateCreateEmail, (req, res) => {
  try {
    const { domain, prefix } = req.body;
    const allowedDomains = parseAllowedDomains();
    const selectedDomain = domain || allowedDomains[0] || 'mail.rzbal.biz.id';
    const db = getDatabase();

    if (domain && !allowedDomains.includes(domain.toLowerCase())) {
      const customDomain = db.prepare('SELECT * FROM custom_domains WHERE domain = ? AND is_verified = 1 AND is_active = 1').get(domain.toLowerCase());
      if (!customDomain) return res.status(400).json({ success: false, message: 'Domain not verified or not active' });
    }

    let email;
    if (prefix) {
      const sanitizedPrefix = sanitizeInput(prefix).replace(/[^a-zA-Z0-9._-]/g, '').substring(0, 30);
      email = `${sanitizedPrefix}@${selectedDomain}`;
      const existing = db.prepare('SELECT * FROM temp_addresses WHERE email_address = ?').get(email);
      if (existing) return res.status(409).json({ success: false, message: 'Email address already taken' });
    } else {
      email = generateEmailAddress(selectedDomain);
    }

    const token = generateToken();
    const now = new Date().toISOString();
    const expiresAt = getExpiryDate(24);
    db.prepare(`INSERT INTO temp_addresses (email_address, token, created_at, expires_at, last_accessed) VALUES (?, ?, ?, ?, ?)`).run(email, token, now, expiresAt, now);
    const jwtToken = generateJwtToken(email);

    const today = getTodayDate();
    const stats = db.prepare('SELECT * FROM stats WHERE date = ?').get(today);
    if (stats) db.prepare('UPDATE stats SET addresses_created = addresses_created + 1 WHERE date = ?').run(today);
    else db.prepare('INSERT INTO stats (date, addresses_created) VALUES (?, 1)').run(today);

    logger.info(`[API] Created email: ${email}`);
    res.json({ success: true, data: { email, token: jwtToken, expiresAt, createdAt: now, domain: selectedDomain } });
  } catch (error) { logger.error('[API] Error creating email:', error); res.status(500).json({ success: false, message: 'Failed to create email address' }); }
});

router.get('/inbox/:email', validateEmailParam, (req, res) => {
  try {
    const { email } = req.params;
    const { page = 1, limit = 50, category } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const db = getDatabase();
    const now = new Date().toISOString();
    db.prepare('UPDATE temp_addresses SET last_accessed = ? WHERE email_address = ?').run(now, email);

    let query = `SELECT id, from_address as fromAddress, from_name as fromName, subject, body_text as preview, size, is_read as isRead, is_forwarded as isForwarded, is_replied as isReplied, created_at || 'Z' as date, category, spam_score as spamScore FROM emails WHERE email_address = ? AND is_deleted = 0 AND expires_at > ?`;
    let params = [email, now];
    if (category) { query += ' AND category = ?'; params.push(category); }
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'; params.push(parseInt(limit), offset);

    const emails = db.prepare(query).all(...params);
    const countQuery = `SELECT COUNT(*) as total FROM emails WHERE email_address = ? AND is_deleted = 0 AND expires_at > ?${category ? ' AND category = ?' : ''}`;
    const countParams = category ? [email, now, category] : [email, now];
    const countResult = db.prepare(countQuery).get(...countParams);

    res.json({ success: true, data: { emails: emails.map(e => ({ id: e.id, from: e.fromAddress || 'Unknown', fromName: e.fromName || '', subject: e.subject || '(No Subject)', preview: e.preview ? e.preview.substring(0, 200) : '', date: e.date, size: formatEmailSize(e.size || 0), sizeBytes: e.size || 0, isRead: !!e.isRead, isForwarded: !!e.isForwarded, isReplied: !!e.isReplied, category: e.category || 'inbox', spamScore: e.spamScore || 0 })), pagination: { page: parseInt(page), limit: parseInt(limit), total: countResult.total, totalPages: Math.ceil(countResult.total / parseInt(limit)) } } });
  } catch (error) { logger.error('[API] Error fetching inbox:', error); res.status(500).json({ success: false, message: 'Failed to fetch inbox' }); }
});

router.get('/message/:id', (req, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();
    const email = db.prepare('SELECT * FROM emails WHERE id = ? AND is_deleted = 0').get(id);
    if (!email) return res.status(404).json({ success: false, message: 'Email not found' });
    db.prepare('UPDATE emails SET is_read = 1 WHERE id = ?').run(id);

    let attachments = []; try { attachments = JSON.parse(email.attachments || '[]'); } catch (e) {}
    const sanitizedHtml = email.body_html ? sanitizeHtml(email.body_html, { allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'style', 'font', 'center']), allowedAttributes: { '*': ['style', 'class', 'id'], img: ['src', 'alt', 'width', 'height', 'style'], a: ['href', 'title', 'target'], table: ['border', 'cellpadding', 'cellspacing', 'width'], td: ['colspan', 'rowspan', 'width', 'height', 'align', 'valign'], th: ['colspan', 'rowspan', 'width', 'height', 'align', 'valign'] }, allowedSchemes: ['http', 'https', 'data', 'mailto', 'tel'], transformTags: { 'a': (tagName, attribs) => { if (attribs.href && !attribs.href.startsWith('mailto:') && !attribs.href.startsWith('tel:')) { attribs.target = '_blank'; attribs.rel = 'noopener noreferrer'; } return { tagName, attribs }; } } }) : '';

    res.json({ success: true, data: { id: email.id, from: email.from_address || 'Unknown', fromName: email.from_name || '', to: email.to_address || '', subject: email.subject || '(No Subject)', bodyText: email.body_text || '', bodyHtml: sanitizedHtml, date: email.created_at + 'Z', size: formatEmailSize(email.size || 0), sizeBytes: email.size || 0, isRead: true, isForwarded: !!email.is_forwarded, isReplied: !!email.is_replied, messageId: email.message_id || '', category: email.category || 'inbox', spamScore: email.spam_score || 0, attachments, headers: email.headers ? JSON.parse(email.headers) : {} } });
  } catch (error) { logger.error('[API] Error fetching email:', error); res.status(500).json({ success: false, message: 'Failed to fetch email' }); }
});

router.delete('/message/:id', (req, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();
    const email = db.prepare('SELECT * FROM emails WHERE id = ? AND is_deleted = 0').get(id);
    if (!email) return res.status(404).json({ success: false, message: 'Email not found' });
    db.prepare('UPDATE emails SET is_deleted = 1 WHERE id = ?').run(id);

    const today = getTodayDate();
    const stats = db.prepare('SELECT * FROM stats WHERE date = ?').get(today);
    if (stats) db.prepare('UPDATE stats SET emails_deleted = emails_deleted + 1 WHERE date = ?').run(today);
    else db.prepare('INSERT INTO stats (date, emails_deleted) VALUES (?, 1)').run(today);

    const io = req.app.get('io');
    if (io) io.to(email.email_address).emit('email_deleted', { id: parseInt(id) });
    logger.info(`[API] Deleted email: ${id}`);
    res.json({ success: true, message: 'Email deleted successfully' });
  } catch (error) { logger.error('[API] Error deleting email:', error); res.status(500).json({ success: false, message: 'Failed to delete email' }); }
});

router.delete('/inbox/:email', validateEmailParam, (req, res) => {
  try {
    const { email } = req.params;
    const db = getDatabase();
    const result = db.prepare(`UPDATE emails SET is_deleted = 1 WHERE email_address = ? AND is_deleted = 0`).run(email);
    const io = req.app.get('io');
    if (io) io.to(email).emit('inbox_cleared', { email });
    logger.info(`[API] Cleared inbox: ${email}, ${result.changes} emails deleted`);
    res.json({ success: true, message: 'All emails deleted', deletedCount: result.changes });
  } catch (error) { logger.error('[API] Error clearing inbox:', error); res.status(500).json({ success: false, message: 'Failed to clear inbox' }); }
});

// Delete email address entirely + all associated emails
router.delete('/address/:email', validateEmailParam, (req, res) => {
  try {
    const { email } = req.params;
    const db = getDatabase();
    const now = new Date().toISOString();

    // Check if address exists
    const address = db.prepare('SELECT * FROM temp_addresses WHERE email_address = ?').get(email);
    if (!address) return res.status(404).json({ success: false, message: 'Email address not found' });

    // Delete all emails for this address
    const emailResult = db.prepare('DELETE FROM emails WHERE email_address = ?').run(email);

    // Delete forwarding rules
    db.prepare('DELETE FROM forwarding_rules WHERE temp_email = ?').run(email);

    // Delete from history
    try { db.prepare('DELETE FROM email_history WHERE email_address = ?').run(email); } catch (e) {}

    // Delete the address itself
    db.prepare('DELETE FROM temp_addresses WHERE email_address = ?').run(email);

    // Update stats
    const today = getTodayDate();
    const stats = db.prepare('SELECT * FROM stats WHERE date = ?').get(today);
    if (stats) db.prepare('UPDATE stats SET addresses_deleted = addresses_deleted + 1 WHERE date = ?').run(today);
    else db.prepare('INSERT INTO stats (date, addresses_deleted) VALUES (?, 1)').run(today);

    // Notify via WebSocket
    const io = req.app.get('io');
    if (io) io.to(email).emit('address_deleted', { email });

    logger.info(`[API] Deleted address: ${email}, ${emailResult.changes} emails removed`);
    res.json({ success: true, message: 'Email address deleted', data: { email, emailsDeleted: emailResult.changes } });
  } catch (error) { logger.error('[API] Error deleting address:', error); res.status(500).json({ success: false, message: 'Failed to delete email address' }); }
});

router.get('/refresh/:email', validateEmailParam, (req, res) => {
  try {
    const { email } = req.params;
    const db = getDatabase();
    const now = new Date().toISOString();
    db.prepare('UPDATE temp_addresses SET last_accessed = ? WHERE email_address = ?').run(now, email);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const newEmails = db.prepare(`SELECT id, from_address as fromAddress, from_name as fromName, subject, body_text as preview, size, is_read as isRead, created_at || 'Z' as date, category FROM emails WHERE email_address = ? AND is_deleted = 0 AND expires_at > ? AND created_at > ? ORDER BY created_at DESC`).all(email, now, fiveMinutesAgo);
    res.json({ success: true, data: { hasNew: newEmails.length > 0, newCount: newEmails.length, emails: newEmails.map(e => ({ id: e.id, from: e.fromAddress || 'Unknown', fromName: e.fromName || '', subject: e.subject || '(No Subject)', preview: e.preview ? e.preview.substring(0, 200) : '', date: e.date, size: formatEmailSize(e.size || 0), isRead: !!e.isRead, category: e.category || 'inbox' })) } });
  } catch (error) { logger.error('[API] Error refreshing inbox:', error); res.status(500).json({ success: false, message: 'Failed to refresh inbox' }); }
});

router.get('/check/:email', validateEmailParam, (req, res) => {
  try {
    const { email } = req.params;
    const db = getDatabase();
    const now = new Date().toISOString();
    const address = db.prepare('SELECT * FROM temp_addresses WHERE email_address = ? AND expires_at > ? AND is_active = 1').get(email, now);
    if (!address) return res.json({ success: true, data: { exists: false } });
    const jwtToken = generateJwtToken(email);
    res.json({ success: true, data: { exists: true, email: address.email_address, token: jwtToken, createdAt: address.created_at, expiresAt: address.expires_at, theme: address.theme_preference || 'dark' } });
  } catch (error) { logger.error('[API] Error checking email:', error); res.status(500).json({ success: false, message: 'Failed to check email' }); }
});

router.get('/stats/:email', validateEmailParam, (req, res) => {
  try {
    const { email } = req.params;
    const db = getDatabase();
    const now = new Date().toISOString();
    const total = db.prepare(`SELECT COUNT(*) as count FROM emails WHERE email_address = ? AND is_deleted = 0 AND expires_at > ?`).get(email, now);
    const unread = db.prepare(`SELECT COUNT(*) as count FROM emails WHERE email_address = ? AND is_deleted = 0 AND expires_at > ? AND is_read = 0`).get(email, now);
    const spam = db.prepare(`SELECT COUNT(*) as count FROM emails WHERE email_address = ? AND is_deleted = 0 AND expires_at > ? AND category = 'spam'`).get(email, now);
    const totalSize = db.prepare(`SELECT COALESCE(SUM(size), 0) as total FROM emails WHERE email_address = ? AND is_deleted = 0 AND expires_at > ?`).get(email, now);
    const categories = db.prepare(`SELECT category, COUNT(*) as count FROM emails WHERE email_address = ? AND is_deleted = 0 AND expires_at > ? GROUP BY category`).all(email, now);
    res.json({ success: true, data: { totalEmails: total.count, unreadEmails: unread.count, spamEmails: spam.count, totalSize: formatEmailSize(totalSize.total), totalSizeBytes: totalSize.total, categories: categories.reduce((acc, c) => { acc[c.category] = c.count; return acc; }, {}) } });
  } catch (error) { logger.error('[API] Error fetching stats:', error); res.status(500).json({ success: false, message: 'Failed to fetch stats' }); }
});

router.get('/categories/:email', validateEmailParam, (req, res) => {
  try {
    const { email } = req.params;
    const db = getDatabase();
    const now = new Date().toISOString();
    const categories = db.prepare(`SELECT category, COUNT(*) as count FROM emails WHERE email_address = ? AND is_deleted = 0 AND expires_at > ? GROUP BY category ORDER BY count DESC`).all(email, now);
    res.json({ success: true, data: { categories: categories.map(c => ({ name: c.category, count: c.count })) } });
  } catch (error) { logger.error('[API] Error fetching categories:', error); res.status(500).json({ success: false, message: 'Failed to fetch categories' }); }
});

module.exports = router;
