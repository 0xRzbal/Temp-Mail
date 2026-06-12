const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getDatabase } = require('../utils/db');
const { hashApiKey, hasPermission } = require('../utils/helpers');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';

function generateToken(email) {
  return jwt.sign({ email: email.toLowerCase().trim(), type: 'email', iat: Date.now() }, JWT_SECRET, { expiresIn: '24h' });
}

function generateAdminToken(username) {
  return jwt.sign({ username, type: 'admin', role: 'superadmin', iat: Date.now() }, JWT_SECRET, { expiresIn: '8h' });
}

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch (err) { return null; }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = req.query.token || (authHeader && authHeader.split(' ')[1]);

  if (!token) return res.status(401).json({ success: false, message: 'Access token required' });

  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ success: false, message: 'Invalid or expired token' });

  if (decoded.type === 'email') {
    const db = getDatabase();
    const address = db.prepare('SELECT * FROM temp_addresses WHERE email_address = ? AND is_active = 1').get(decoded.email);
    if (!address) return res.status(401).json({ success: false, message: 'Email address not found or inactive' });
    if (new Date(address.expires_at) < new Date()) return res.status(401).json({ success: false, message: 'Email address has expired' });
    req.email = decoded.email;
    req.token = token;
    req.userType = 'email';
  } else if (decoded.type === 'admin') {
    req.userType = 'admin';
    req.username = decoded.username;
    req.role = decoded.role;
  }
  next();
}

function adminAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = req.query.token || (authHeader && authHeader.split(' ')[1]);
  if (!token) return res.status(401).json({ success: false, message: 'Admin token required' });
  const decoded = verifyToken(token);
  if (!decoded || decoded.type !== 'admin') return res.status(403).json({ success: false, message: 'Admin access required' });
  req.userType = 'admin';
  req.username = decoded.username;
  req.role = decoded.role;
  next();
}

function apiKeyMiddleware(req, res, next) {
  if (process.env.API_KEYS_ENABLED !== 'true') return next();
  const apiKeyHeader = process.env.API_KEY_HEADER || 'X-API-Key';
  const apiKey = req.headers[apiKeyHeader.toLowerCase()] || req.query.apiKey;
  if (!apiKey) return next();

  const db = getDatabase();
  const keyHash = hashApiKey(apiKey);
  const keyRecord = db.prepare('SELECT * FROM api_keys WHERE key_hash = ? AND is_active = 1').get(keyHash);

  if (!keyRecord) return res.status(401).json({ success: false, message: 'Invalid API key' });
  if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) return res.status(401).json({ success: false, message: 'API key has expired' });

  if (keyRecord.ip_whitelist) {
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const allowedIps = keyRecord.ip_whitelist.split(',').map(ip => ip.trim());
    if (!allowedIps.includes(clientIp) && !allowedIps.includes('*')) return res.status(403).json({ success: false, message: 'IP not whitelisted' });
  }

  db.prepare('UPDATE api_keys SET request_count = request_count + 1, last_used = ? WHERE id = ?').run(new Date().toISOString(), keyRecord.id);
  req.apiKey = keyRecord;
  req.userType = 'apikey';
  req.permissions = keyRecord.permissions;
  next();
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (req.userType === 'admin') return next();
    if (req.userType === 'apikey' && !hasPermission(req.permissions, permission)) {
      return res.status(403).json({ success: false, message: `Permission '${permission}' required` });
    }
    next();
  };
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = req.query.token || (authHeader && authHeader.split(' ')[1]);
  if (token) {
    const decoded = verifyToken(token);
    if (decoded) { req.email = decoded.email; req.token = token; req.userType = decoded.type; }
  }
  next();
}

async function adminLogin(username, password) {
  const db = getDatabase();
  const admin = db.prepare('SELECT * FROM admin_users WHERE username = ? AND is_active = 1').get(username);
  if (!admin) return null;
  const isValid = await bcrypt.compare(password, admin.password_hash);
  if (!isValid) return null;
  db.prepare('UPDATE admin_users SET last_login = ? WHERE id = ?').run(new Date().toISOString(), admin.id);
  return generateAdminToken(admin.username);
}

module.exports = { generateToken, generateAdminToken, verifyToken, authMiddleware, adminAuthMiddleware, apiKeyMiddleware, requirePermission, optionalAuth, adminLogin };
