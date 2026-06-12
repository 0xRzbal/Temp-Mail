const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const { getDatabase } = require('../utils/db');
const { getTodayDate } = require('../utils/helpers');
const { validateReply } = require('../middleware/validate');
const logger = require('../utils/logger');

const smtpConfig = {
  host: process.env.REPLY_SMTP_HOST,
  port: parseInt(process.env.REPLY_SMTP_PORT) || 587,
  secure: false,
  tls: { rejectUnauthorized: false }
};
if (process.env.REPLY_SMTP_USER) {
  smtpConfig.auth = { user: process.env.REPLY_SMTP_USER, pass: process.env.REPLY_SMTP_PASS };
}
const transporter = nodemailer.createTransport(smtpConfig);

router.post('/send', validateReply, async (req, res) => {
  try {
    if (process.env.REPLY_ENABLED !== 'true') return res.status(403).json({ success: false, message: 'Reply feature is disabled' });
    const { emailId, body, subject } = req.body;
    const db = getDatabase();
    const email = db.prepare('SELECT * FROM emails WHERE id = ?').get(emailId);
    if (!email) return res.status(404).json({ success: false, message: 'Original email not found' });

    const replySubject = subject || `Re: ${email.subject || '(No Subject)'}`;
    const mailOptions = {
      from: `"${process.env.REPLY_FROM_NAME || 'JoeMail'}" <${process.env.REPLY_FROM_ADDRESS || process.env.REPLY_SMTP_USER || email.to_address}>`,
      to: email.from_address,
      subject: replySubject,
      text: body,
      html: `<div style="font-family: Arial, sans-serif;">${body.replace(/\n/g, '<br>')}</div>`,
      inReplyTo: email.message_id || undefined,
      references: email.message_id || undefined
    };

    const info = await transporter.sendMail(mailOptions);
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO replies (email_id, from_address, to_address, subject, body, sent_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(emailId, email.to_address, email.from_address, replySubject, body, now, 'sent');
    db.prepare('UPDATE emails SET is_replied = 1 WHERE id = ?').run(emailId);

    const today = getTodayDate();
    const stats = db.prepare('SELECT * FROM stats WHERE date = ?').get(today);
    if (stats) db.prepare('UPDATE stats SET emails_replied = emails_replied + 1 WHERE date = ?').run(today);
    else db.prepare('INSERT INTO stats (date, emails_replied) VALUES (?, 1)').run(today);

    logger.info(`[REPLY] Sent reply to ${email.from_address} for email ${emailId}`);
    res.json({ success: true, data: { messageId: info.messageId, sentAt: now } });
  } catch (error) { logger.error('[REPLY] Send error:', error); res.status(500).json({ success: false, message: 'Failed to send reply' }); }
});

router.get('/history/:emailId', (req, res) => {
  try {
    const { emailId } = req.params;
    const db = getDatabase();
    const replies = db.prepare('SELECT * FROM replies WHERE email_id = ? ORDER BY sent_at DESC').all(emailId);
    res.json({ success: true, data: { replies: replies.map(r => ({ id: r.id, from: r.from_address, to: r.to_address, subject: r.subject, body: r.body, sentAt: r.sent_at, status: r.status })) } });
  } catch (error) { logger.error('[REPLY] History error:', error); res.status(500).json({ success: false, message: 'Failed to fetch reply history' }); }
});

module.exports = router;
