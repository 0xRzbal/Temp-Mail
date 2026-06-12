const nodemailer = require('nodemailer');
const { getDatabase } = require('../utils/db');
const { getTodayDate } = require('../utils/helpers');
const logger = require('../utils/logger');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.REPLY_SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.REPLY_SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.REPLY_SMTP_USER || '',
        pass: process.env.REPLY_SMTP_PASS || ''
      }
    });
  }
  return transporter;
}

async function forwardEmail(tempEmail, emailId) {
  if (process.env.FORWARDING_ENABLED !== 'true') return;
  if (!process.env.REPLY_SMTP_USER || !process.env.REPLY_SMTP_PASS) return;

  const db = getDatabase();
  const rules = db.prepare(`SELECT * FROM forwarding_rules WHERE temp_email = ? AND is_active = 1 AND (forward_count < max_forwards OR max_forwards = 0)`).all(tempEmail);
  if (rules.length === 0) return;

  const email = db.prepare('SELECT * FROM emails WHERE id = ?').get(emailId);
  if (!email) return;

  for (const rule of rules) {
    try {
      let attachments = [];
      try { attachments = JSON.parse(email.attachments || '[]'); } catch (e) {}
      const mailOptions = {
        from: `"JoeMail Forward" <${process.env.REPLY_SMTP_USER || 'noreply@mail.rzbal.biz.id'}>`,
        to: rule.forward_to,
        subject: `[FWD] ${email.subject || '(No Subject)'}`,
        text: `Forwarded from ${tempEmail}\n\n---\n\n${email.body_text || ''}`,
        html: `<p><strong>Forwarded from:</strong> ${tempEmail}</p><hr>${email.body_html || `<pre>${email.body_text || ''}</pre>`}`,
        attachments: attachments.map(att => ({ filename: att.filename, path: `.${att.url}` }))
      };
      await getTransporter().sendMail(mailOptions);
      db.prepare(`UPDATE forwarding_rules SET forward_count = forward_count + 1, last_forwarded = ? WHERE id = ?`).run(new Date().toISOString(), rule.id);
      db.prepare('UPDATE emails SET is_forwarded = 1 WHERE id = ?').run(emailId);

      const today = getTodayDate();
      const stats = db.prepare('SELECT * FROM stats WHERE date = ?').get(today);
      if (stats) db.prepare('UPDATE stats SET emails_forwarded = emails_forwarded + 1 WHERE date = ?').run(today);
      else db.prepare('INSERT INTO stats (date, emails_forwarded) VALUES (?, 1)').run(today);

      logger.info(`[FORWARD] Email ${emailId} forwarded from ${tempEmail} to ${rule.forward_to}`);
    } catch (error) { logger.error(`[FORWARD] Failed to forward to ${rule.forward_to}:`, error.message); }
  }
}

module.exports = { forwardEmail };
