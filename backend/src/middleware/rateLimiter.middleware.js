/**
 * rateLimiter.middleware.js — Configurable per-endpoint rate limiters.
 *
 * All window/max values read from environment variables so they can be
 * tuned for development, staging, and production without code changes.
 *
 * Defaults are conservative but not so strict as to block normal testing:
 *
 *   CAPTCHA_CURRENT_LIMIT_MAX   = 60  per window  (get/create challenge)
 *   CAPTCHA_VERIFY_LIMIT_MAX    = 30  per window  (answer submission)
 *   CAPTCHA_CLAIM_LIMIT_MAX     = 30  per window  (claim reward)
 *   CAPTCHA_NEW_LIMIT_MAX       = 30  per window  (no-thanks / new challenge)
 *   RATE_LIMIT_WINDOW_MS        = 900000 (15 min)
 *
 * Rate-limit responses follow the same JSON shape as all other errors:
 *   { "success": false, "message": "Too many requests. Please try again later." }
 *
 * NOTE: The existing global limiter (100/15min/IP on /api/*) in server.js
 * is preserved. These endpoint-specific limiters are ADDITIONAL guards.
 */

const rateLimit = require('express-rate-limit');

// ─── Shared config helpers ─────────────────────────────────────────────────────

const windowMs = () =>
  parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000;

const makeMessage = () => ({
  success: false,
  message: 'Too many requests. Please try again later.',
});

// ─── Per-endpoint limiters ─────────────────────────────────────────────────────

/**
 * captchaCurrentLimiter
 * GET /api/captcha/current — relatively lenient; page loads may call this often
 */
const captchaCurrentLimiter = rateLimit({
  windowMs: windowMs(),
  max: parseInt(process.env.CAPTCHA_CURRENT_LIMIT_MAX, 10) || 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: makeMessage(),
});

/**
 * captchaVerifyLimiter
 * POST /api/captcha/verify — tighter; each verify is a meaningful action
 */
const captchaVerifyLimiter = rateLimit({
  windowMs: windowMs(),
  max: parseInt(process.env.CAPTCHA_VERIFY_LIMIT_MAX, 10) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: makeMessage(),
});

/**
 * captchaClaimLimiter
 * POST /api/captcha/claim — tight; claiming is a once-per-challenge action
 */
const captchaClaimLimiter = rateLimit({
  windowMs: windowMs(),
  max: parseInt(process.env.CAPTCHA_CLAIM_LIMIT_MAX, 10) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: makeMessage(),
});

/**
 * captchaNewLimiter
 * POST /api/captcha/new — moderate; No Thanks flow, but shouldn't be abused
 */
const captchaNewLimiter = rateLimit({
  windowMs: windowMs(),
  max: parseInt(process.env.CAPTCHA_NEW_LIMIT_MAX, 10) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: makeMessage(),
});

module.exports = {
  captchaCurrentLimiter,
  captchaVerifyLimiter,
  captchaClaimLimiter,
  captchaNewLimiter,
};
