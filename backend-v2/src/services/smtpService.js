const { SMTPServer } = require('smtp-server');
const simpleParser = require('mailparser').simpleParser;
const { getDatabase } = require('../utils/db');
const { generateToken, getExpiryDate, getTodayDate, parseAllowedDomains } = require('../utils/helpers');
const webhookService = require('./webhookService');
const forwardingService = require('./forwardingService');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

function startSMTPServer(io) {
  const allowedDomains = parseAllowedDomains();
  const expiryHours = parseInt(process.env.EMAIL_EXPIRY_HOURS) || 24;
  const maxSize = (parseInt(process.env.MAX_EMAIL_SIZE_MB) || 25) * 1024 * 1024;

  const server = new SMTPServer({
    secure: false,
    disabledCommands: ['AUTH'],
    logger: false,
    size: maxSize,

    onConnect(session, callback) { logger.info(`[SMTP] Connection from ${session.remoteAddress}`); callback(); },

    onRcptTo(address, session, callback) {
      const email = address.address.toLowerCase().trim();
      const domain = email.split('@')[1];
      const db = getDatabase();
      const customDomain = db.prepare('SELECT * FROM custom_domains WHERE domain = ? AND is_verified = 1 AND is_active = 1').get(domain);
      if (!allowedDomains.includes(domain) && !customDomain) {
        logger.warn(`[SMTP] Rejected: Domain ${domain} not allowed`);
        return callback(new Error('Invalid domain'));
      }
      logger.info(`[SMTP] RCPT TO: ${email}`);
      callback();
    },

    onData(stream, session, callback) {
      let rawEmail = '';
      stream.on('data', (chunk) => { rawEmail += chunk; });
      stream.on('end', async () => {
        try {
          const parsed = await simpleParser(rawEmail);
          const toAddresses = parsed.to && parsed.to.value ? parsed.to.value.map(v => v.address.toLowerCase().trim()) : [];
          if (toAddresses.length === 0) { logger.warn('[SMTP] No recipient found'); return callback(new Error('No recipient')); }

          const db = getDatabase();
          const now = new Date().toISOString();
          const expiresAt = getExpiryDate(expiryHours);

          for (const toAddress of toAddresses) {
            const existingAddress = db.prepare('SELECT * FROM temp_addresses WHERE email_address = ?').get(toAddress);
            if (!existingAddress) {
              const token = generateToken();
              db.prepare(`INSERT INTO temp_addresses (email_address, token, created_at, expires_at, last_accessed) VALUES (?, ?, ?, ?, ?)`).run(toAddress, token, now, expiresAt, now);
            } else {
              db.prepare('UPDATE temp_addresses SET last_accessed = ?, access_count = access_count + 1 WHERE email_address = ?').run(now, toAddress);
            }

            const attachments = [];
            if (parsed.attachments && parsed.attachments.length > 0) {
              const maxAttachments = parseInt(process.env.MAX_ATTACHMENTS) || 10;
              for (let i = 0; i < Math.min(parsed.attachments.length, maxAttachments); i++) {
                const attachment = parsed.attachments[i];
                const fileName = `${Date.now()}_${i}_${attachment.filename || 'attachment'}`;
                const filePath = path.join(uploadsDir, fileName);
                fs.writeFileSync(filePath, attachment.content);
                attachments.push({ filename: attachment.filename, contentType: attachment.contentType, size: attachment.size, url: `/uploads/${fileName}` });
              }
            }

            let spamScore = 0;
            if (parsed.subject && (parsed.subject.includes('urgent') || parsed.subject.includes('winner'))) spamScore += 0.3;
            if (parsed.from && parsed.from.text && parsed.from.text.includes('noreply')) spamScore += 0.1;

            const result = db.prepare(`INSERT INTO emails (email_address, from_address, from_name, to_address, subject, body_text, body_html, headers, attachments, size, expires_at, message_id, ip_address, spam_score, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
              toAddress,
              parsed.from && parsed.from.value && parsed.from.value[0] ? parsed.from.value[0].address : '',
              parsed.from && parsed.from.value && parsed.from.value[0] ? (parsed.from.value[0].name || '') : '',
              toAddress,
              parsed.subject || '(No Subject)',
              parsed.text || '',
              parsed.html || '',
              JSON.stringify(parsed.headers || {}),
              JSON.stringify(attachments),
              Buffer.byteLength(rawEmail, 'utf8'),
              expiresAt,
              parsed.messageId || '',
              session.remoteAddress || '',
              spamScore,
              spamScore > 0.5 ? 'spam' : 'inbox'
            );

            const today = getTodayDate();
            const stats = db.prepare('SELECT * FROM stats WHERE date = ?').get(today);
            if (stats) db.prepare('UPDATE stats SET emails_received = emails_received + 1 WHERE date = ?').run(today);
            else db.prepare('INSERT INTO stats (date, emails_received) VALUES (?, 1)').run(today);

            if (io) {
              io.to(toAddress).emit('new_email', {
                id: result.lastInsertRowid,
                from: parsed.from && parsed.from.value && parsed.from.value[0] ? parsed.from.value[0].address : '',
                fromName: parsed.from && parsed.from.value && parsed.from.value[0] ? (parsed.from.value[0].name || '') : '',
                subject: parsed.subject || '(No Subject)',
                date: now, size: Buffer.byteLength(rawEmail, 'utf8'), isRead: false, category: spamScore > 0.5 ? 'spam' : 'inbox'
              });
            }

            webhookService.trigger('email.received', { emailId: result.lastInsertRowid, toAddress, fromAddress: parsed.from && parsed.from.value && parsed.from.value[0] ? parsed.from.value[0].address : '', subject: parsed.subject || '(No Subject)', timestamp: now });
            forwardingService.forwardEmail(toAddress, result.lastInsertRowid);
            logger.info(`[SMTP] Email delivered: ID ${result.lastInsertRowid} to ${toAddress}`);
          }
          callback();
        } catch (error) { logger.error('[SMTP] Error processing email:', error); callback(new Error('Failed to process email')); }
      });
    },

    onClose(session) { logger.info(`[SMTP] Connection closed: ${session.remoteAddress}`); }
  });

  const smtpPort = parseInt(process.env.SMTP_PORT) || 2525;
  const smtpHost = process.env.SMTP_HOST || '0.0.0.0';
  server.listen(smtpPort, smtpHost, (err) => {
    if (err) logger.error('[SMTP] Failed to start:', err);
    else logger.info(`[SMTP] Server listening on ${smtpHost}:${smtpPort}`);
  });
  return server;
}

module.exports = { startSMTPServer };
