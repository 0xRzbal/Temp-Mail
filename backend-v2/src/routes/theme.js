const express = require('express');
const router = express.Router();
const { getDatabase } = require('../utils/db');
const { validateEmailParam } = require('../middleware/validate');
const logger = require('../utils/logger');

const ALLOWED_THEMES = (process.env.THEME_ALLOWED || 'dark,light,auto,contrast').split(',');

router.get('/:email', validateEmailParam, (req, res) => {
  try {
    const { email } = req.params;
    const db = getDatabase();
    const address = db.prepare('SELECT theme_preference FROM temp_addresses WHERE email_address = ?').get(email);
    const theme = address ? address.theme_preference : process.env.THEME_DEFAULT || 'dark';
    res.json({ success: true, data: { theme, available: ALLOWED_THEMES } });
  } catch (error) { logger.error('[THEME] Get error:', error); res.status(500).json({ success: false, message: 'Failed to get theme' }); }
});

router.put('/:email', validateEmailParam, (req, res) => {
  try {
    const { email } = req.params;
    const { theme } = req.body;
    if (!theme || !ALLOWED_THEMES.includes(theme)) return res.status(400).json({ success: false, message: `Invalid theme. Allowed: ${ALLOWED_THEMES.join(', ')}` });
    const db = getDatabase();
    db.prepare('UPDATE temp_addresses SET theme_preference = ? WHERE email_address = ?').run(theme, email);
    logger.info(`[THEME] Updated: ${email} -> ${theme}`);
    res.json({ success: true, data: { theme, email } });
  } catch (error) { logger.error('[THEME] Update error:', error); res.status(500).json({ success: false, message: 'Failed to update theme' }); }
});

module.exports = router;
