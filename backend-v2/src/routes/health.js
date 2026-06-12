const express = require('express');
const router = express.Router();
const { getDatabase } = require('../utils/db');
const { getDatabaseStats } = require('../utils/cleanup');
const dns = require('dns');

router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    db.prepare('SELECT 1').get();
    const stats = getDatabaseStats();
    res.json({ success: true, status: 'healthy', timestamp: new Date().toISOString(), uptime: process.uptime(), memory: process.memoryUsage(), version: '2.0.0', database: stats });
  } catch (error) { res.status(503).json({ success: false, status: 'unhealthy', error: error.message }); }
});


router.get('/dns', async (req, res) => {
  try {
    const domain = req.query.domain || 'google.com'; // Default to google.com or use a configurable one
    await dns.promises.lookup(domain);
    res.json({ success: true, status: 'healthy', service: 'dns', domain: domain });
  } catch (error) {
    res.status(503).json({ success: false, status: 'unhealthy', service: 'dns', error: error.message });
  }
});

module.exports = router;

