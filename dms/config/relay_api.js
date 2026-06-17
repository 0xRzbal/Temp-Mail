const express = require('express');
const router = express.Router();
const { adminAuthMiddleware } = require('../middleware/auth');
const logger = require('../utils/logger');
const { execSync } = require('child_process');
const fs = require('fs');

const RELAY_CONFIG_PATH = '/dms-config/relay.conf';
const RELAY_STATUS_PATH = '/dms-config/relay-status.json';

function getConfig() {
  let config = { enabled: false, host: '', port: '2525', username: '', password: '' };
  if (fs.existsSync(RELAY_CONFIG_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(RELAY_CONFIG_PATH, 'utf8'));
      config = { ...config, ...data };
    } catch (e) {}
  }
  return config;
}

function getStatus() {
  if (fs.existsSync(RELAY_STATUS_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(RELAY_STATUS_PATH, 'utf8'));
    } catch (e) {}
  }
  return { active: false, relayhost: '', updated: '' };
}

function saveConfig(config) {
  fs.writeFileSync(RELAY_CONFIG_PATH, JSON.stringify(config, null, 2));
}

router.get('/config', adminAuthMiddleware, (req, res) => {
  try {
    const config = getConfig();
    const status = getStatus();
    config.active = status.active;
    config.relayhost = status.relayhost;
    res.json({ success: true, data: config });
  } catch (error) {
    logger.error('[RELAY] Get config error:', error);
    res.status(500).json({ success: false, message: 'Failed to get relay config' });
  }
});

router.post('/config', adminAuthMiddleware, (req, res) => {
  try {
    const { host, port, username, password, enabled } = req.body;
    if (!host || !username || !password) {
      return res.status(400).json({ success: false, message: 'Host, username, and password required' });
    }
    const config = { host, port: port || '2525', username, password, enabled: enabled !== false };
    saveConfig(config);
    logger.info('[RELAY] Config saved:', { host, port, enabled });
    res.json({ success: true, message: 'Config saved. Applying within 5 seconds...' });
  } catch (error) {
    logger.error('[RELAY] Save config error:', error);
    res.status(500).json({ success: false, message: 'Failed to save relay config' });
  }
});

router.post('/test', adminAuthMiddleware, (req, res) => {
  try {
    const { host, port } = req.body;
    if (!host) return res.status(400).json({ success: false, message: 'Host required' });
    
    const portNum = port || '2525';
    try {
      const output = execSync('echo "QUIT" | timeout 10 openssl s_client -starttls smtp -connect ' + host + ':' + portNum + ' -quiet 2>&1 | head -5', 
        { encoding: 'utf8', timeout: 15000 });
      res.json({ success: true, message: 'Connection successful', data: { output: output.trim() } });
    } catch (e) {
      res.json({ success: false, message: 'Connection failed' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Test failed' });
  }
});

router.post('/test-send', adminAuthMiddleware, (req, res) => {
  try {
    const { to, from } = req.body;
    if (!to) return res.status(400).json({ success: false, message: 'Recipient required' });
    
    const fromAddr = from || 'test@rzbal.biz.id';
    const subject = 'JoeMail Relay Test - ' + new Date().toISOString();
    const cmd = 'echo "Subject: ' + subject + '\\nFrom: ' + fromAddr + '\\nTo: ' + to + '\\nContent-Type: text/plain\\n\\nTest email from JoeMail relay." | sendmail -f ' + fromAddr + ' ' + to;
    execSync(cmd, { encoding: 'utf8', timeout: 15000 });
    res.json({ success: true, message: 'Test email sent to ' + to });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to send test email' });
  }
});

router.get('/stats', adminAuthMiddleware, (req, res) => {
  try {
    const status = getStatus();
    res.json({ success: true, data: { ...status, recentRelayed: 0, recentSent: 0, queueStatus: 'N/A' } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get stats' });
  }
});

router.get('/logs', adminAuthMiddleware, (req, res) => {
  try {
    const lines = req.query.lines || 50;
    const output = execSync('tail -' + lines + ' /var/log/mail.log 2>/dev/null | grep -E "(relay=|status=|smtp2go)" || true', 
      { encoding: 'utf8', timeout: 10000 });
    const logs = output ? output.trim().split('\n').filter(Boolean) : [];
    res.json({ success: true, data: { logs } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get logs' });
  }
});

router.get('/presets', adminAuthMiddleware, (req, res) => {
  res.json({ success: true, data: [
    { name: 'SMTP2GO', host: 'mail.smtp2go.com', port: '2525', description: 'Free 1000 emails/month' },
    { name: 'SendGrid', host: 'smtp.sendgrid.net', port: '587', description: 'Free 100 emails/day' },
    { name: 'Mailgun', host: 'smtp.mailgun.org', port: '587', description: 'Free 5000 emails/month' },
    { name: 'Amazon SES', host: 'email-smtp.us-east-1.amazonaws.com', port: '587', description: '$0.10/1000 emails' },
    { name: 'Brevo', host: 'smtp-relay.brevo.com', port: '587', description: 'Free 300 emails/day' },
    { name: 'Resend', host: 'smtp.resend.com', port: '465', description: 'Free 3000 emails/month' },
  ]});
});

module.exports = router;
