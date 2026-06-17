const express = require('express');
const router = express.Router();
const { getDatabase } = require('../utils/db');
const { adminAuthMiddleware, adminLogin } = require('../middleware/auth');
const { formatEmailSize, getTodayDate, maskEmail } = require('../utils/helpers');
const { getDatabaseStats } = require('../utils/cleanup');
const logger = require('../utils/logger');
const os = require('os');
const fs = require('fs');
const path = require('path');

// DMS sync: update postfix vhost + transport, trigger reload
function syncDMSDomains() {
  try {
    const vhostPath = '/dms-config/postfix-vhost.cf';
    const transportPath = '/dms-config/postfix-transport';
    const signalPath = '/dms-config/.reload-signal';
    const db = getDatabase();
    const activeDomains = db.prepare('SELECT domain FROM custom_domains WHERE is_active = 1').all().map(d => d.domain);
    const builtInDomains = (process.env.ALLOWED_DOMAINS || '').split(',').map(d => d.trim()).filter(Boolean);
    const allDomains = [...new Set([...builtInDomains, ...activeDomains])];

    // vhost: domain + mail.domain
    const vhostEntries = [];
    for (const d of allDomains) {
      vhostEntries.push(d);
      if (!d.startsWith('mail.')) vhostEntries.push('mail.' + d);
    }
    fs.writeFileSync(vhostPath, vhostEntries.join('\n') + '\n');

    // transport: route all domains to joemail-api:2525
    const transportEntries = [];
    for (const d of allDomains) {
      transportEntries.push(d + '         smtp:joemail-api:2525');
      if (!d.startsWith('mail.')) transportEntries.push('mail.' + d + '    smtp:joemail-api:2525');
    }
    fs.writeFileSync(transportPath, transportEntries.join('\n') + '\n');

    // Signal host-side watcher to reload DMS
    try { fs.writeFileSync(signalPath, Date.now().toString()); } catch {}

    logger.info('[DMS-SYNC] Synced ' + allDomains.length + ' domains (vhost + transport)');
  } catch (error) {
    logger.error('[DMS-SYNC] Failed to sync domains:', error.message);
  }
}

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Username and password required' });
    const token = await adminLogin(username, password);
    if (!token) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    res.json({ success: true, data: { token, expiresIn: '8h' } });
  } catch (error) { logger.error('[ADMIN] Login error:', error); res.status(500).json({ success: false, message: 'Login failed' }); }
});

router.get('/dashboard', adminAuthMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const stats = getDatabaseStats();
    const today = getTodayDate();
    const todayStats = db.prepare(`SELECT * FROM stats WHERE date = ?`).get(today);
    const recentEmails = db.prepare(`SELECT id, email_address, from_address, subject, created_at, size FROM emails WHERE is_deleted = 0 ORDER BY created_at DESC LIMIT 10`).all();
    const recentAddresses = db.prepare(`SELECT email_address, created_at, last_accessed, access_count FROM temp_addresses ORDER BY last_accessed DESC LIMIT 10`).all();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    // Container memory from cgroup (project-only usage)
    let containerUsed = 0;
    try { containerUsed = parseInt(require('fs').readFileSync('/sys/fs/cgroup/memory/memory.usage_in_bytes', 'utf8').trim()); } catch {}
    if (!containerUsed) try { containerUsed = parseInt(require('fs').readFileSync('/sys/fs/cgroup/memory.current', 'utf8').trim()); } catch {}
    if (!containerUsed) containerUsed = process.memoryUsage().rss;
    const containerCap = 512 * 1024 * 1024; // 512MB reference cap for gauge
    const systemHealth = { uptime: process.uptime(), memory: { total: containerCap, used: containerUsed, free: containerCap - containerUsed, percent: Math.round((containerUsed / containerCap) * 100) }, nodeVersion: process.version, platform: process.platform };
    res.json({ success: true, data: { stats, today: todayStats || { emails_received: 0, addresses_created: 0 }, recentEmails: recentEmails.map(e => ({ id: e.id, email: maskEmail(e.email_address), from: e.from_address, subject: e.subject, date: e.created_at, size: formatEmailSize(e.size) })), recentAddresses: recentAddresses.map(a => ({ email: maskEmail(a.email_address), createdAt: a.created_at, lastAccessed: a.last_accessed, accessCount: a.access_count })), systemHealth } });
  } catch (error) { logger.error('[ADMIN] Dashboard error:', error); res.status(500).json({ success: false, message: 'Failed to load dashboard' }); }
});

router.get('/users', adminAuthMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const users = db.prepare(`SELECT id, email_address, created_at, last_accessed, access_count, is_active, theme_preference FROM temp_addresses ORDER BY last_accessed DESC LIMIT ? OFFSET ?`).all(parseInt(limit), offset);
    const total = db.prepare('SELECT COUNT(*) as count FROM temp_addresses').get();
    res.json({ success: true, data: { users: users.map(u => ({ id: u.id, email: maskEmail(u.email_address), createdAt: u.created_at, lastAccessed: u.last_accessed, accessCount: u.access_count, isActive: !!u.is_active, theme: u.theme_preference })), pagination: { page: parseInt(page), limit: parseInt(limit), total: total.count } } });
  } catch (error) { logger.error('[ADMIN] Users error:', error); res.status(500).json({ success: false, message: 'Failed to fetch users' }); }
});

router.get('/emails', adminAuthMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const { page = 1, limit = 50, category } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let query = `SELECT id, email_address, from_address, subject, category, is_read, is_forwarded, is_replied, created_at, size FROM emails WHERE is_deleted = 0`;
    let params = [];
    if (category) { query += ' AND category = ?'; params.push(category); }
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'; params.push(parseInt(limit), offset);
    const emails = db.prepare(query).all(...params);
    const total = db.prepare(`SELECT COUNT(*) as count FROM emails WHERE is_deleted = 0${category ? ' AND category = ?' : ''}`).get(...(category ? [category] : []));
    res.json({ success: true, data: { emails: emails.map(e => ({ id: e.id, email: maskEmail(e.email_address), from: e.from_address, subject: e.subject, category: e.category, isRead: !!e.is_read, isForwarded: !!e.is_forwarded, isReplied: !!e.is_replied, date: e.created_at, size: formatEmailSize(e.size) })), pagination: { page: parseInt(page), limit: parseInt(limit), total: total.count } } });
  } catch (error) { logger.error('[ADMIN] Emails error:', error); res.status(500).json({ success: false, message: 'Failed to fetch emails' }); }
});

// Admin domain management
router.post('/domains', adminAuthMiddleware, (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ success: false, message: 'Domain required' });
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM custom_domains WHERE domain = ?').get(domain.toLowerCase());
    if (existing) {
      if (existing.is_active) return res.status(409).json({ success: false, message: 'Domain already exists' });
      // Reactivate soft-deleted domain
      db.prepare('UPDATE custom_domains SET is_active = 1, is_verified = 0, verified_at = NULL WHERE id = ?').run(existing.id);
      const verificationRecord = existing.verification_record;
      logger.info(`[ADMIN] Domain reactivated: ${domain}`);
      return res.json({ success: true, data: { domain: domain.toLowerCase(), verificationToken: verificationRecord } });
    }
    const crypto = require('crypto');
    const { execSync } = require('child_process');
    const verificationRecord = 'joemail-verify=' + crypto.randomBytes(16).toString('hex');
    db.prepare(`INSERT INTO custom_domains (domain, verification_record, is_active, settings) VALUES (?, ?, 1, ?)`).run(domain.toLowerCase(), verificationRecord, JSON.stringify({}));
    logger.info(`[ADMIN] Domain added: ${domain}`);
    syncDMSDomains();
    // Auto-generate DKIM keys for new domain
    try {
      const d = domain.toLowerCase();
      const keyDir = '/dms-config/opendkim/keys/' + d;
      const hostKeyDir = '/opt/joemail/dms/config/opendkim/keys/' + d;
      // Generate on host (where opendkim-genkey might be available) or in DMS container
      try {
        execSync('docker exec joemail-dms mkdir -p /etc/opendkim/keys/' + d);
        execSync('docker exec joemail-dms opendkim-genkey -b 2048 -d ' + d + ' -D /etc/opendkim/keys/' + d + ' -s mail -v');
        execSync('docker exec joemail-dms chown -R opendkim:opendkim /etc/opendkim/keys/' + d);
        execSync('docker exec joemail-dms chmod 600 /etc/opendkim/keys/' + d + '/mail.private');
        // Copy to shared volume so API can read it later
        execSync('mkdir -p ' + hostKeyDir);
        execSync('docker cp joemail-dms:/etc/opendkim/keys/' + d + '/mail.txt ' + hostKeyDir + '/mail.txt');
        // Update KeyTable and SigningTable in DMS
        execSync('docker exec joemail-dms bash -c "grep -q \'mail._domainkey.' + d + '\' /etc/opendkim/KeyTable || echo \'mail._domainkey.' + d + ' ' + d + ':mail:/etc/opendkim/keys/' + d + '/mail.private\' >> /etc/opendkim/KeyTable"');
        execSync('docker exec joemail-dms bash -c "grep -q \'@' + d + '\' /etc/opendkim/SigningTable || echo \'*@' + d + ' mail._domainkey.' + d + '\' >> /etc/opendkim/SigningTable"');
        execSync('docker exec joemail-dms supervisorctl restart opendkim');
        // Also do the same for mail.domain
        execSync('docker exec joemail-dms mkdir -p /etc/opendkim/keys/mail.' + d);
        execSync('docker exec joemail-dms opendkim-genkey -b 2048 -d mail.' + d + ' -D /etc/opendkim/keys/mail.' + d + ' -s mail -v');
        execSync('docker exec joemail-dms chown -R opendkim:opendkim /etc/opendkim/keys/mail.' + d);
        execSync('docker exec joemail-dms chmod 600 /etc/opendkim/keys/mail.' + d + '/mail.private');
        execSync('mkdir -p ' + hostKeyDir.replace(d, 'mail.' + d));
        execSync('docker cp joemail-dms:/etc/opendkim/keys/mail.' + d + '/mail.txt ' + hostKeyDir.replace(d, 'mail.' + d) + '/mail.txt');
        execSync('docker exec joemail-dms bash -c "grep -q \'mail._domainkey.mail.' + d + '\' /etc/opendkim/KeyTable || echo \'mail._domainkey.mail.' + d + ' mail.' + d + ':mail:/etc/opendkim/keys/mail.' + d + '/mail.private\' >> /etc/opendkim/KeyTable"');
        execSync('docker exec joemail-dms bash -c "grep -q \'@mail.' + d + '\' /etc/opendkim/SigningTable || echo \'*@mail.' + d + ' mail._domainkey.mail.' + d + '\' >> /etc/opendkim/SigningTable"');
        logger.info('[ADMIN] DKIM keys generated for ' + d);
      } catch (dkimErr) {
        logger.warn('[ADMIN] DKIM generation failed (manual setup needed): ' + dkimErr.message);
      }
    } catch {}
    res.json({ success: true, data: { domain: domain.toLowerCase(), verificationToken: verificationRecord } });
  } catch (error) { logger.error('[ADMIN] Add domain error:', error); res.status(500).json({ success: false, message: 'Failed to add domain' }); }
});

router.delete('/domains/:domain', adminAuthMiddleware, (req, res) => {
  try {
    const { domain } = req.params;
    const db = getDatabase();
    const result = db.prepare('DELETE FROM custom_domains WHERE domain = ?').run(domain.toLowerCase());
    if (result.changes === 0) return res.status(404).json({ success: false, message: 'Domain not found' });
    logger.info(`[ADMIN] Domain permanently deleted: ${domain}`);
    syncDMSDomains();
    res.json({ success: true, message: 'Domain permanently deleted' });
  } catch (error) { logger.error('[ADMIN] Delete domain error:', error); res.status(500).json({ success: false, message: 'Failed to delete domain' }); }
});

router.post('/domains/:domain/verify', adminAuthMiddleware, (req, res) => {
  try {
    const { domain } = req.params;
    const db = getDatabase();
    const domainRecord = db.prepare('SELECT * FROM custom_domains WHERE domain = ?').get(domain.toLowerCase());
    if (!domainRecord) return res.status(404).json({ success: false, message: 'Domain not found' });
    const now = new Date().toISOString();
    db.prepare('UPDATE custom_domains SET is_verified = 1, is_active = 1, verified_at = ? WHERE id = ?').run(now, domainRecord.id);
    const today = getTodayDate();
    const stats = db.prepare('SELECT * FROM stats WHERE date = ?').get(today);
    if (stats) db.prepare('UPDATE stats SET custom_domains_added = custom_domains_added + 1 WHERE date = ?').run(today);
    else db.prepare('INSERT INTO stats (date, custom_domains_added) VALUES (?, 1)').run(today);
    logger.info(`[ADMIN] Domain verified: ${domain}`);
    syncDMSDomains();
    res.json({ success: true, data: { verified: true, domain: domain.toLowerCase(), verifiedAt: now } });
  } catch (error) { logger.error('[ADMIN] Verify domain error:', error); res.status(500).json({ success: false, message: 'Failed to verify domain' }); }
});

router.get('/domains', adminAuthMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const domains = db.prepare('SELECT * FROM custom_domains ORDER BY created_at DESC').all();
    res.json({ success: true, data: { domains: domains.map(d => ({ id: d.id, domain: d.domain, isVerified: !!d.is_verified, isActive: !!d.is_active, createdAt: d.created_at, verifiedAt: d.verified_at, verificationToken: d.verification_record || null, emailCount: db.prepare('SELECT COUNT(*) as c FROM emails WHERE email_address LIKE ?').get('%@' + d.domain).c })) } });
  } catch (error) { logger.error('[ADMIN] Domains error:', error); res.status(500).json({ success: false, message: 'Failed to fetch domains' }); }
});

router.get('/webhooks', adminAuthMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const webhooks = db.prepare('SELECT * FROM webhooks ORDER BY created_at DESC').all();
    res.json({ success: true, data: { webhooks: webhooks.map(w => ({ id: w.id, url: w.url, events: w.events, isActive: !!w.is_active, successCount: w.success_count, failureCount: w.failure_count, lastTriggered: w.last_triggered })) } });
  } catch (error) { logger.error('[ADMIN] Webhooks error:', error); res.status(500).json({ success: false, message: 'Failed to fetch webhooks' }); }
});

router.get('/stats', adminAuthMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const { days = 30 } = req.query;
    const stats = db.prepare(`SELECT * FROM stats ORDER BY date DESC LIMIT ?`).all(parseInt(days));
    const totals = db.prepare(`SELECT SUM(emails_received) as totalEmails, SUM(addresses_created) as totalAddresses, SUM(emails_deleted) as totalDeleted, SUM(emails_forwarded) as totalForwarded, SUM(emails_replied) as totalReplied, SUM(webhooks_triggered) as totalWebhooks, SUM(custom_domains_added) as totalDomains FROM stats`).get();
    res.json({ success: true, data: { daily: stats, totals: { totalEmails: totals.totalEmails || 0, totalAddresses: totals.totalAddresses || 0, totalDeleted: totals.totalDeleted || 0, totalForwarded: totals.totalForwarded || 0, totalReplied: totals.totalReplied || 0, totalWebhooks: totals.totalWebhooks || 0, totalDomains: totals.totalDomains || 0 } } });
  } catch (error) { logger.error('[ADMIN] Stats error:', error); res.status(500).json({ success: false, message: 'Failed to fetch stats' }); }
});

// Admin reply to email
router.post('/reply', adminAuthMiddleware, async (req, res) => {
  try {
    const { emailId, body, subject, from } = req.body;
    if (!emailId || !body) return res.status(400).json({ success: false, message: 'emailId and body required' });
    const nodemailer = require('nodemailer');
    const db = getDatabase();
    const email = db.prepare('SELECT * FROM emails WHERE id = ?').get(emailId);
    if (!email) return res.status(404).json({ success: false, message: 'Email not found' });

    // Check if SMTP is configured
    if (!process.env.REPLY_SMTP_USER || !process.env.REPLY_SMTP_PASS) {
      return res.status(403).json({ success: false, message: 'Reply SMTP not configured. Set REPLY_SMTP_USER and REPLY_SMTP_PASS in .env' });
    }

    const transporter = nodemailer.createTransport({
      host: process.env.REPLY_SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.REPLY_SMTP_PORT) || 587,
      secure: false,
      auth: { user: process.env.REPLY_SMTP_USER, pass: process.env.REPLY_SMTP_PASS }
    });

    const replySubject = subject || `Re: ${email.subject || '(No Subject)'}`;
    const mailOptions = {
      from: from ? `<${from}>` : `"${process.env.REPLY_FROM_NAME || 'JoeMail'}" <${process.env.REPLY_SMTP_USER}>`,
      to: email.from_address,
      subject: replySubject,
      text: body,
      html: `<div style="font-family: Arial, sans-serif;">${body.replace(/\n/g, '<br>')}</div>`,
      inReplyTo: email.message_id || undefined,
      references: email.message_id || undefined
    };

    const info = await transporter.sendMail(mailOptions);
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO replies (email_id, from_address, to_address, subject, body, sent_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(emailId, from || email.email_address, email.from_address, replySubject, body, now, 'sent');
    db.prepare('UPDATE emails SET is_replied = 1 WHERE id = ?').run(emailId);

    const today = getTodayDate();
    const stats = db.prepare('SELECT * FROM stats WHERE date = ?').get(today);
    if (stats) db.prepare('UPDATE stats SET emails_replied = emails_replied + 1 WHERE date = ?').run(today);
    else db.prepare('INSERT INTO stats (date, emails_replied) VALUES (?, 1)').run(today);

    logger.info(`[ADMIN] Reply sent to ${email.from_address} for email ${emailId}`);
    res.json({ success: true, data: { messageId: info.messageId, sentAt: now } });
  } catch (error) { logger.error('[ADMIN] Reply error:', error); res.status(500).json({ success: false, message: 'Failed to send reply: ' + error.message }); }
});

// Get single email with full body
router.get('/email/:id', adminAuthMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();
    const email = db.prepare('SELECT * FROM emails WHERE id = ?').get(id);
    if (!email) return res.status(404).json({ success: false, message: 'Email not found' });
    const replies = db.prepare('SELECT * FROM replies WHERE email_id = ? ORDER BY sent_at DESC').all(id);
    res.json({ success: true, data: {
      id: email.id, email: email.email_address, from: email.from_address,
      subject: email.subject, body: email.body_text || email.body_html || '',
      html: email.body_html || '', date: email.created_at, size: email.size,
      category: email.category, isRead: !!email.is_read, isReplied: !!email.is_replied,
      attachments: email.attachments ? JSON.parse(email.attachments) : [],
      replies: replies.map(r => ({ id: r.id, from: r.from_address, to: r.to_address, subject: r.subject, body: r.body, sentAt: r.sent_at, status: r.status }))
    } });
  } catch (error) { logger.error('[ADMIN] Get email error:', error); res.status(500).json({ success: false, message: 'Failed to fetch email' }); }
});

router.delete('/email/:id', adminAuthMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();
    db.prepare('UPDATE emails SET is_deleted = 1 WHERE id = ?').run(id);
    logger.info(`[ADMIN] Force deleted email: ${id}`);
    res.json({ success: true, message: 'Email force deleted' });
  } catch (error) { logger.error('[ADMIN] Force delete error:', error); res.status(500).json({ success: false, message: 'Failed to delete email' }); }
});

router.delete('/user/:email', adminAuthMiddleware, (req, res) => {
  try {
    const { email } = req.params;
    const db = getDatabase();

    // Hard delete: remove address, emails, and forwarding rules
    const emailResult = db.prepare('DELETE FROM emails WHERE email_address = ?').run(email);
    try { db.prepare('DELETE FROM forwarding_rules WHERE temp_email = ?').run(email); } catch (e) {}
    const addrResult = db.prepare('DELETE FROM temp_addresses WHERE email_address = ?').run(email);

    if (addrResult.changes === 0) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    logger.info(`[ADMIN] Deleted address: ${email}, ${emailResult.changes} emails removed`);
    res.json({ success: true, message: 'Address deleted', data: { email, emailsDeleted: emailResult.changes } });
  } catch (error) { logger.error('[ADMIN] Delete address error:', error); res.status(500).json({ success: false, message: 'Failed to delete address' }); }
});

// Bulk delete addresses
router.post('/users/bulk-delete', adminAuthMiddleware, (req, res) => {
  try {
    const { emails } = req.body;
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ success: false, message: 'No emails provided' });
    }
    const db = getDatabase();
    let totalEmailsDeleted = 0;
    let totalAddrDeleted = 0;
    const deleteEmails = db.prepare('DELETE FROM emails WHERE email_address = ?');
    const deleteRules = db.prepare('DELETE FROM forwarding_rules WHERE temp_email = ?');
    const deleteAddr = db.prepare('DELETE FROM temp_addresses WHERE email_address = ?');

    for (const email of emails) {
      const emailResult = deleteEmails.run(email);
      try { deleteRules.run(email); } catch (e) {}
      const addrResult = deleteAddr.run(email);
      totalEmailsDeleted += emailResult.changes;
      totalAddrDeleted += addrResult.changes;
    }

    logger.info(`[ADMIN] Bulk deleted ${totalAddrDeleted} addresses, ${totalEmailsDeleted} emails`);
    res.json({ success: true, message: `${totalAddrDeleted} addresses deleted`, data: { addressesDeleted: totalAddrDeleted, emailsDeleted: totalEmailsDeleted } });
  } catch (error) { logger.error('[ADMIN] Bulk delete error:', error); res.status(500).json({ success: false, message: 'Failed to bulk delete' }); }
});

router.get('/server-info', adminAuthMiddleware, async (req, res) => {
  try {
    // Fetch public IP from external service (avoids Docker internal IP)
    let ipv4 = '127.0.0.1';
    try {
      const https = require('https');
      const url = 'https://api.ipify.org?format=json';
      ipv4 = await new Promise((resolve, reject) => {
        https.get(url, (resp) => {
          let data = '';
          resp.on('data', (chunk) => data += chunk);
          resp.on('end', () => {
            try { resolve(JSON.parse(data).ip); }
            catch { resolve('127.0.0.1'); }
          });
        }).on('error', () => resolve('127.0.0.1'));
      });
    } catch {}
    const os = require('os');
    res.json({ success: true, data: { ip: ipv4, hostname: os.hostname() } });
  } catch (error) { res.json({ success: true, data: { ip: '127.0.0.1', hostname: 'unknown' } }); }
});

// Get DKIM public key for a domain
router.get('/dkim/:domain', adminAuthMiddleware, (req, res) => {
  try {
    const domain = req.params.domain;
    const keyPath = path.join('/dms-config/opendkim/keys', domain, 'mail.txt');
    if (!fs.existsSync(keyPath)) {
      return res.json({ success: false, message: 'DKIM key not found for ' + domain });
    }
    const raw = fs.readFileSync(keyPath, 'utf8');
    const quotedParts = raw.match(/"([^"]+)"/g);
    if (!quotedParts) return res.json({ success: false, message: 'Invalid DKIM key format' });
    const allQuoted = quotedParts.map(m => m.replace(/"/g, '').trim()).join('');
    const pMatch = allQuoted.match(/p=([A-Za-z0-9+/=]+)/);
    if (!pMatch) return res.json({ success: false, message: 'No p= value found in DKIM key' });
    const dkim = 'v=DKIM1; h=sha256; k=rsa; p=' + pMatch[1];
    res.json({ success: true, data: { domain, dkim } });
  } catch (error) {
    logger.error('[ADMIN] DKIM fetch error:', error);
    res.json({ success: false, message: 'Failed to read DKIM key' });
  }
});

// DNS Health Check for a domain
router.get('/domains/:domain/health', adminAuthMiddleware, async (req, res) => {
  try {
    const domain = req.params.domain.toLowerCase();
    const dns = require('dns').promises;
    const checks = {};

    // MX check
    try {
      const mx = await dns.resolveMx(domain);
      const hasMailServer = mx.some(r => r.exchange.includes('mail.' + domain) || r.exchange === 'mail.' + domain);
      checks.mx = { status: mx.length > 0 ? (hasMailServer ? 'ok' : 'warning') : 'error', records: mx.map(r => ({ exchange: r.exchange, priority: r.priority })) };
    } catch (e) { checks.mx = { status: 'error', error: e.code || 'No MX records' }; }

    // SPF check
    try {
      const txt = await dns.resolveTxt(domain);
      const flat = txt.map(r => r.join('')).filter(r => r.startsWith('v=spf1'));
      checks.spf = { status: flat.length > 0 ? 'ok' : 'error', records: flat };
    } catch (e) { checks.spf = { status: 'error', error: e.code || 'No TXT records' }; }

    // DKIM check
    try {
      const dkimTxt = await dns.resolveTxt('mail._domainkey.' + domain);
      const flat = dkimTxt.map(r => r.join('')).filter(r => r.includes('v=DKIM1'));
      checks.dkim = { status: flat.length > 0 ? 'ok' : 'error', records: flat };
    } catch (e) { checks.dkim = { status: 'error', error: e.code || 'No DKIM record' }; }

    // DMARC check
    try {
      const dmarcTxt = await dns.resolveTxt('_dmarc.' + domain);
      const flat = dmarcTxt.map(r => r.join('')).filter(r => r.startsWith('v=DMARC1'));
      checks.dmarc = { status: flat.length > 0 ? 'ok' : 'error', records: flat };
    } catch (e) { checks.dmarc = { status: 'error', error: e.code || 'No DMARC record' }; }

    // A record for mail.domain
    try {
      const a = await dns.resolve4('mail.' + domain);
      checks.a = { status: a.length > 0 ? 'ok' : 'error', records: a };
    } catch (e) { checks.a = { status: 'error', error: e.code || 'No A record for mail.' + domain }; }

    const statuses = Object.values(checks).map(c => c.status);
    const overall = statuses.every(s => s === 'ok') ? 'ok' : statuses.some(s => s === 'error') ? 'error' : 'warning';

    res.json({ success: true, data: { domain, overall, checks } });
  } catch (error) { logger.error('[ADMIN] DNS health error:', error); res.status(500).json({ success: false, message: 'DNS health check failed' }); }
});


// Change admin password


// DELETE SENT EMAIL
router.delete('/sent/:id', adminAuthMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM replies WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ success: false, message: 'Sent email not found' });
    logger.info('[SENT] Deleted sent email ' + req.params.id);
    res.json({ success: true });
  } catch (error) { logger.error('[SENT] Delete error:', error); res.status(500).json({ success: false, message: 'Failed to delete' }); }
});

// BULK DELETE SENT EMAILS
router.post('/sent/bulk-delete', adminAuthMiddleware, (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !ids.length) return res.status(400).json({ success: false, message: 'No IDs provided' });
    const db = getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    const result = db.prepare('DELETE FROM replies WHERE id IN (' + placeholders + ')').run(...ids);
    logger.info('[SENT] Bulk deleted ' + result.changes + ' sent emails');
    res.json({ success: true, deleted: result.changes });
  } catch (error) { logger.error('[SENT] Bulk delete error:', error); res.status(500).json({ success: false, message: 'Failed to bulk delete' }); }
});

// COMPOSE - Send new email
router.post('/compose', adminAuthMiddleware, async (req, res) => {
  try {
    const { to, subject, body, from: customFrom } = req.body;
    if (!to || !body) return res.status(400).json({ success: false, message: 'Recipient and body required' });
    const nodemailer = require('nodemailer');
    const smtpConfig = {
      host: process.env.REPLY_SMTP_HOST || 'mail.smtp2go.com',
      port: parseInt(process.env.REPLY_SMTP_PORT) || 2525,
      secure: false,
      tls: { rejectUnauthorized: false }
    };
    if (process.env.REPLY_SMTP_USER) {
      smtpConfig.auth = { user: process.env.REPLY_SMTP_USER, pass: process.env.REPLY_SMTP_PASS };
    }
    const transporter = nodemailer.createTransport(smtpConfig);
    const fromAddr = customFrom || process.env.REPLY_FROM_ADDRESS || process.env.REPLY_SMTP_USER || 'admin@rzbal.biz.id';
    const from = fromAddr;
    const info = await transporter.sendMail({ from, to, subject: subject || '(No Subject)', text: body, html: body.replace(/\n/g, '<br>') });
    const db = getDatabase();
    const now = new Date().toISOString();
    db.prepare("INSERT INTO replies (email_id, from_address, to_address, subject, body, sent_at, status) VALUES (0, ?, ?, ?, ?, ?, 'sent')").run(fromAddr, to, subject || '(No Subject)', body, now);
    logger.info(`[COMPOSE] Sent email to ${to}`);
    res.json({ success: true, data: { messageId: info.messageId, sentAt: now } });
  } catch (error) { logger.error('[COMPOSE] Send error:', error); res.status(500).json({ success: false, message: 'Failed to send: ' + error.message }); }
});

// SENT EMAILS - List all sent emails (from replies table where email_id=0 or all)
router.get('/sent', adminAuthMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const sent = db.prepare('SELECT * FROM replies ORDER BY sent_at DESC LIMIT 100').all();
    res.json({ success: true, data: { emails: sent.map(r => ({ id: r.id, to: r.to_address, from: r.from_address, subject: r.subject, body: r.body, date: r.sent_at, status: r.status })) } });
  } catch (error) { logger.error('[SENT] Error:', error); res.status(500).json({ success: false, message: 'Failed to load sent emails' }); }
});

router.post('/change-password', adminAuthMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ success: false, message: 'Current and new password required' });
    if (newPassword.length < 6) return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    const db = getDatabase();
    const bcrypt = require('bcryptjs');
    const admin = db.prepare('SELECT * FROM admin_users WHERE username = ? AND is_active = 1').get(req.username);
    if (!admin) return res.status(404).json({ success: false, message: 'Admin user not found' });
    const isValid = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!isValid) return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    const newHash = await bcrypt.hash(newPassword, 12);
    db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(newHash, admin.id);
    logger.info('[ADMIN] Password changed for:', req.username);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) { logger.error('[ADMIN] Change password error:', error); res.status(500).json({ success: false, message: 'Failed to change password' }); }
});

module.exports = router;

// Sync DMS domains on module load (startup)
try { syncDMSDomains(); } catch {}