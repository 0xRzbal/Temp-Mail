const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const FIRST_NAMES = [
  'ahmad','muhammad','abdul','arif','budi','daniel','david','dennis','eric','frank',
  'george','henry','ivan','james','john','kevin','leo','lucas','marco','nathan',
  'oliver','peter','quinn','richard','samuel','thomas','umar','victor','william','xavier',
  'yusuf','zack','adam','brian','charles','dylan','ethan','felix','gabriel','harris',
  'ian','jacob','kyle','liam','mason','noah','oscar','patrick','rayan','steven',
  'andrew','anton','benny','carlos','danny','edwin','faisal','gavin','harry','irfan',
  'jason','kenneth','louis','matthew','nick','omar','paul','ramon','simon','tony',
  'abdullah','ali','amir','bilal','dani','farhan','gilang','hadi','irvan','joko',
  'khalid','lukman','mikail','nizar','pratama','rafi','sultan','taufik','wildan','zaki',
  'aisha','amelia','bella','clara','diana','elena','fiona','grace','hannah','isabella',
  'jessica','kate','laura','maria','nadia','olivia','putri','queen','rachel','sarah',
  'tiara','uma','violet','wendy','xena','yuki','zara','amanda','citra','devi'
];
const LAST_NAMES = [
  'pratama','wijaya','santoso','susanto','hidayat','kurniawan','putra','putri','sari','lestari',
  'mulyadi','hartono','setiawan','gunawan','firmansyah','rahman','ibrahim','osman','ahmed','khan',
  'smith','johnson','williams','brown','jones','garcia','martinez','robinson','clark','lewis',
  'walker','hall','young','king','wright','lopez','hill','scott','green','adams',
  'baker','nelson','carter','mitchell','perez','roberts','turner','phillips','campbell','parker',
  'evans','edwards','collins','stewart','sanchez','morris','rogers','reed','cook','morgan',
  'bell','murphy','bailey','rivera','cooper','richardson','cox','ward','torres','peterson',
  'gray','ramirez','watson','brooks','kelly','sanders','price','bennett','wood','barnes',
  'ross','henderson','coleman','jenkins','perry','powell','long','patterson','hughes','flores',
  'washington','butler','simmons','foster','gonzalez','bryant','alexander','russell','griffin','diaz'
];

function generateRandomString(length = 10) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function generateEmailAddress(domain) {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${first}.${last}@${domain}`;
}

function generateToken() { return crypto.randomBytes(32).toString('hex'); }
function generateApiKey() { return `jm_${crypto.randomBytes(32).toString('base64url')}`; }
function hashApiKey(key) { return crypto.createHash('sha256').update(key).digest('hex'); }
function hashEmail(email) { return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex'); }
function sanitizeInput(input) { return typeof input === 'string' ? input.trim().replace(/[<>]/g, '').substring(0, 1000) : ''; }
function formatEmailSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
function getExpiryDate(hours = 24) { const d = new Date(); d.setHours(d.getHours() + hours); return d.toISOString(); }
function getTodayDate() { return new Date().toISOString().split('T')[0]; }
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function parseAllowedDomains() {
  const domainsEnv = process.env.ALLOWED_DOMAINS || process.env.DOMAIN || 'mail.rzbal.biz.id';
  return domainsEnv.split(',').map(d => d.trim().toLowerCase());
}
function generateWebhookSignature(payload, secret) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}
function verifyWebhookSignature(payload, signature, secret) {
  const expected = generateWebhookSignature(payload, secret);
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
}
function generateVerificationRecord(domain) { return `joemail-verify=${crypto.randomBytes(16).toString('hex')}`; }
function maskEmail(email) { return email; }
function maskApiKey(key) { return key.length < 8 ? '***' : `${key.substring(0,4)}...${key.substring(key.length-4)}`; }
function parsePermissions(permissionsString) { return permissionsString ? permissionsString.split(',').map(p => p.trim().toLowerCase()) : ['read']; }
function hasPermission(userPermissions, requiredPermission) {
  const perms = parsePermissions(userPermissions);
  return perms.includes('*') || perms.includes(requiredPermission);
}

module.exports = {
  generateRandomString, generateEmailAddress, generateToken, generateApiKey,
  hashApiKey, hashEmail, sanitizeInput, formatEmailSize, getExpiryDate, getTodayDate,
  isValidEmail, parseAllowedDomains, generateWebhookSignature, verifyWebhookSignature,
  generateVerificationRecord, maskEmail, maskApiKey, parsePermissions, hasPermission
};
