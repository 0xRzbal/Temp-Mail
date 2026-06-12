const express = require('express');
const router = express.Router();
const { getDatabase } = require('../utils/db');
const { getDatabaseStats } = require('../utils/cleanup');

router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const now = new Date().toISOString();
    const today = new Date().toISOString().split('T')[0];

    const todayStats = db.prepare(`SELECT COALESCE(SUM(emails_received), 0) as emailsReceived, COALESCE(SUM(addresses_created), 0) as addressesCreated FROM stats WHERE date = ?`).get(today);
    const allTimeStats = db.prepare(`SELECT COALESCE(SUM(emails_received), 0) as totalEmailsReceived, COALESCE(SUM(addresses_created), 0) as totalAddressesCreated, COALESCE(SUM(emails_deleted), 0) as totalEmailsDeleted, COALESCE(SUM(emails_forwarded), 0) as totalEmailsForwarded, COALESCE(SUM(emails_replied), 0) as totalEmailsReplied, COALESCE(SUM(webhooks_triggered), 0) as totalWebhooks, COALESCE(SUM(custom_domains_added), 0) as totalDomains FROM stats`).get();
    const activeEmails = db.prepare(`SELECT COUNT(*) as count FROM emails WHERE is_deleted = 0 AND expires_at > ?`).get(now);
    const activeAddresses = db.prepare(`SELECT COUNT(*) as count FROM temp_addresses WHERE expires_at > ?`).get(now);
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const chartData = db.prepare(`SELECT date, emails_received as count FROM stats WHERE date >= ? ORDER BY date ASC`).all(sevenDaysAgo.toISOString().split('T')[0]);

    res.json({ success: true, data: { today: { emailsReceived: todayStats.emailsReceived || 0, addressesCreated: todayStats.addressesCreated || 0 }, allTime: { totalEmailsReceived: allTimeStats.totalEmailsReceived || 0, totalAddressesCreated: allTimeStats.totalAddressesCreated || 0, totalEmailsDeleted: allTimeStats.totalEmailsDeleted || 0, totalEmailsForwarded: allTimeStats.totalEmailsForwarded || 0, totalEmailsReplied: allTimeStats.totalEmailsReplied || 0, totalWebhooks: allTimeStats.totalWebhooks || 0, totalDomains: allTimeStats.totalDomains || 0 }, current: { activeEmails: activeEmails.count, activeAddresses: activeAddresses.count }, chart: chartData } });
  } catch (error) { res.status(500).json({ success: false, message: 'Failed to fetch statistics' }); }
});

module.exports = router;
