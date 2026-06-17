const { body, param, query, validationResult } = require("express-validator");
const { isValidEmail, parseAllowedDomains } = require("../utils/helpers");

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: "Validation failed", errors: errors.array().map(e => ({ field: e.path, message: e.msg })) });
  }
  next();
}

function isDomainAllowed(domain) {
  const allowedDomains = parseAllowedDomains();
  if (allowedDomains.includes(domain.toLowerCase())) return true;
  try {
    const { getDatabase } = require("../utils/db");
    const db = getDatabase();
    const customDomain = db.prepare("SELECT * FROM custom_domains WHERE domain = ? AND is_verified = 1 AND is_active = 1").get(domain.toLowerCase());
    return !!customDomain;
  } catch (e) {
    return false;
  }
}

function validateEmailParam(req, res, next) {
  const { email } = req.params;
  if (!email) return res.status(400).json({ success: false, message: "Email parameter is required" });
  if (!isValidEmail(email)) return res.status(400).json({ success: false, message: "Invalid email format" });
  const domain = email.split("@")[1].toLowerCase();
  if (!isDomainAllowed(domain)) return res.status(400).json({ success: false, message: "Invalid domain. Allowed: " + parseAllowedDomains().join(", ") });
  next();
}

function validateCreateEmail(req, res, next) {
  const { domain } = req.body;
  if (domain) {
    if (!isDomainAllowed(domain.toLowerCase())) return res.status(400).json({ success: false, message: "Invalid domain. Allowed: " + parseAllowedDomains().join(", ") });
  }
  next();
}

const validateWebhook = [body("url").isURL().withMessage("Valid URL required"), body("events").optional().isString(), handleValidationErrors];
const validateForwarding = [body("tempEmail").isEmail().withMessage("Valid temp email required"), body("forwardTo").isEmail().withMessage("Valid forward-to email required"), handleValidationErrors];
const validateReply = [body("emailId").isInt().withMessage("Valid email ID required"), body("body").isString().isLength({ min: 1, max: 10000 }).withMessage("Reply body required"), handleValidationErrors];
const validateDomain = [body("domain").isFQDN().withMessage("Valid domain required"), handleValidationErrors];
const validateSearch = [query("q").isString().isLength({ min: 1, max: 200 }).withMessage("Search query required"), query("email").optional().isEmail(), handleValidationErrors];

module.exports = { validateEmailParam, validateCreateEmail, validateWebhook, validateForwarding, validateReply, validateDomain, validateSearch, handleValidationErrors };
