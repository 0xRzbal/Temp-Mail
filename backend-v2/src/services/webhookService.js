const axios = require('axios');
const { getDatabase } = require('../utils/db');
const { generateWebhookSignature } = require('../utils/helpers');
const logger = require('../utils/logger');

async function trigger(event, payload) {
  if (process.env.WEBHOOKS_ENABLED !== 'true') return;
  const db = getDatabase();
  const webhooks = db.prepare(`SELECT * FROM webhooks WHERE is_active = 1 AND (events LIKE ? OR events = '*' OR events LIKE '%*%')`).all(`%${event}%`);

  for (const webhook of webhooks) {
    try {
      const signature = webhook.secret ? generateWebhookSignature(payload, webhook.secret) : null;
      const headers = { 'Content-Type': 'application/json', 'User-Agent': 'JoeMail-Webhook/2.0', 'X-Webhook-Event': event, 'X-Webhook-ID': webhook.id.toString() };
      if (signature) headers['X-Webhook-Signature'] = signature;

      const response = await axios.post(webhook.url, payload, { headers, timeout: parseInt(process.env.WEBHOOK_TIMEOUT_MS) || 5000, validateStatus: () => true });
      const isSuccess = response.status >= 200 && response.status < 300;

      db.prepare(`INSERT INTO webhook_deliveries (webhook_id, event, payload, response_status, response_body, delivered_at, is_success) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        webhook.id, event, JSON.stringify(payload), response.status, JSON.stringify(response.data).substring(0, 1000), new Date().toISOString(), isSuccess ? 1 : 0
      );

      if (isSuccess) db.prepare('UPDATE webhooks SET success_count = success_count + 1, last_triggered = ?, failure_count = 0 WHERE id = ?').run(new Date().toISOString(), webhook.id);
      else db.prepare('UPDATE webhooks SET failure_count = failure_count + 1 WHERE id = ?').run(webhook.id);

      logger.info(`[WEBHOOK] ${event} to ${webhook.url} - ${response.status}`);
    } catch (error) {
      logger.error(`[WEBHOOK] Failed to trigger ${webhook.url}:`, error.message);
      db.prepare(`INSERT INTO webhook_deliveries (webhook_id, event, payload, response_status, delivered_at, is_success, retry_count) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        webhook.id, event, JSON.stringify(payload), 0, new Date().toISOString(), 0, 1
      );
      db.prepare('UPDATE webhooks SET failure_count = failure_count + 1 WHERE id = ?').run(webhook.id);
    }
  }
}

async function retryFailedWebhooks() {
  const db = getDatabase();
  const maxRetries = parseInt(process.env.WEBHOOK_MAX_RETRIES) || 3;
  const failedDeliveries = db.prepare(`SELECT wd.*, w.url, w.secret FROM webhook_deliveries wd JOIN webhooks w ON wd.webhook_id = w.id WHERE wd.is_success = 0 AND wd.retry_count < ? ORDER BY wd.delivered_at DESC LIMIT 50`).all(maxRetries);

  for (const delivery of failedDeliveries) {
    try {
      const payload = JSON.parse(delivery.payload);
      const signature = delivery.secret ? generateWebhookSignature(payload, delivery.secret) : null;
      const headers = { 'Content-Type': 'application/json', 'User-Agent': 'JoeMail-Webhook/2.0', 'X-Webhook-Event': delivery.event, 'X-Webhook-ID': delivery.webhook_id.toString(), 'X-Retry-Count': (delivery.retry_count + 1).toString() };
      if (signature) headers['X-Webhook-Signature'] = signature;

      const response = await axios.post(delivery.url, payload, { headers, timeout: parseInt(process.env.WEBHOOK_TIMEOUT_MS) || 5000, validateStatus: () => true });
      const isSuccess = response.status >= 200 && response.status < 300;

      db.prepare(`UPDATE webhook_deliveries SET response_status = ?, response_body = ?, is_success = ?, retry_count = retry_count + 1 WHERE id = ?`).run(response.status, JSON.stringify(response.data).substring(0, 1000), isSuccess ? 1 : 0, delivery.id);
      if (isSuccess) db.prepare('UPDATE webhooks SET success_count = success_count + 1, failure_count = MAX(0, failure_count - 1) WHERE id = ?').run(delivery.webhook_id);
      logger.info(`[WEBHOOK] Retry ${delivery.event} to ${delivery.url} - ${response.status}`);
    } catch (error) {
      db.prepare('UPDATE webhook_deliveries SET retry_count = retry_count + 1 WHERE id = ?').run(delivery.id);
      logger.error(`[WEBHOOK] Retry failed for ${delivery.url}:`, error.message);
    }
  }
}

module.exports = { trigger, retryFailedWebhooks };
