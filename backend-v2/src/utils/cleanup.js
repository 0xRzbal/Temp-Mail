const { getDatabase } = require('./db');
const { getTodayDate } = require('./helpers');
const logger = require('./logger');

function cleanupExpiredEmails() {
  const db = getDatabase();
  const now = new Date().toISOString();

  const deleteEmails = db.prepare(`UPDATE emails SET is_deleted = 1 WHERE expires_at < ? AND is_deleted = 0`);
  const emailsDeleted = deleteEmails.run(now);

  const deleteAddresses = db.prepare('DELETE FROM temp_addresses WHERE expires_at < ?');
  const addressesDeleted = deleteAddresses.run(now);

  const deleteForwarding = db.prepare('DELETE FROM forwarding_rules WHERE expires_at < ?');
  const forwardingDeleted = deleteForwarding.run(now);

  const deleteReplies = db.prepare('DELETE FROM replies WHERE sent_at < datetime(?, "-7 days")');
  const repliesDeleted = deleteForwarding.run(now);

  if (emailsDeleted.changes > 0) {
    const today = getTodayDate();
    const stats = db.prepare('SELECT * FROM stats WHERE date = ?').get(today);
    if (stats) {
      db.prepare('UPDATE stats SET emails_deleted = emails_deleted + ? WHERE date = ?').run(emailsDeleted.changes, today);
    } else {
      db.prepare('INSERT INTO stats (date, emails_deleted) VALUES (?, ?)').run(today, emailsDeleted.changes);
    }
  }

  logger.info(`[CLEANUP] Deleted ${emailsDeleted.changes} emails, ${addressesDeleted.changes} addresses, ${forwardingDeleted.changes} forwarding rules`);
  return { emailsDeleted: emailsDeleted.changes, addressesDeleted: addressesDeleted.changes, forwardingDeleted: forwardingDeleted.changes };
}

function aggregateDailyStats() {
  const db = getDatabase();
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];

  const stats = db.prepare(`SELECT COUNT(*) as totalEmails, SUM(CASE WHEN is_read=0 THEN 1 ELSE 0 END) as unreadEmails, SUM(CASE WHEN is_forwarded=1 THEN 1 ELSE 0 END) as forwardedEmails, SUM(CASE WHEN is_replied=1 THEN 1 ELSE 0 END) as repliedEmails, SUM(size) as totalSize FROM emails WHERE date(created_at) = ? AND is_deleted = 0`).get(dateStr);

  logger.info(`[STATS] Daily aggregation for ${dateStr}:`, stats);
  return stats;
}

function getDatabaseStats() {
  const db = getDatabase();
  return {
    totalEmails: db.prepare('SELECT COUNT(*) as count FROM emails WHERE is_deleted = 0').get().count,
    totalAddresses: db.prepare('SELECT COUNT(*) as count FROM temp_addresses').get().count,
    totalDomains: db.prepare('SELECT COUNT(*) as count FROM custom_domains WHERE is_verified = 1').get().count,
    totalApiKeys: db.prepare('SELECT COUNT(*) as count FROM api_keys WHERE is_active = 1').get().count,
    totalWebhooks: db.prepare('SELECT COUNT(*) as count FROM webhooks WHERE is_active = 1').get().count,
    todayEmails: db.prepare(`SELECT COUNT(*) as count FROM emails WHERE date(created_at) = date('now') AND is_deleted = 0`).get().count
  };
}

module.exports = { cleanupExpiredEmails, aggregateDailyStats, getDatabaseStats };
