/**
 * captcha.routes.js — Route definitions for the CAPTCHA module.
 *
 * Mounted in server.js as:  app.use('/api/captcha', captchaRoutes)
 *
 * All routes require JWT authentication — protect is applied at router level.
 * Each write endpoint also has a dedicated rate limiter (Stage 6).
 *
 * Protected routes:
 *   GET  /api/captcha/current   — get or create an active challenge
 *   POST /api/captcha/verify    — submit an answer
 *   POST /api/captcha/claim     — claim a completed reward (Stage 5)
 *   POST /api/captcha/new       — No Thanks; invalidate old + create fresh (Stage 5)
 */

const express = require('express');

const { protect } = require('../middleware/auth.middleware');
const {
  captchaCurrentLimiter,
  captchaVerifyLimiter,
  captchaClaimLimiter,
  captchaNewLimiter,
} = require('../middleware/rateLimiter.middleware');
const {
  getCurrentCaptcha,
  verifyCaptcha,
  claimCaptcha,
  newCaptcha,
} = require('../controllers/captcha.controller');
const {
  verifyCaptchaRules,
  claimCaptchaRules,
  newCaptchaRules,
  handleValidationErrors,
} = require('../validators/captcha.validator');

const router = express.Router();

// All CAPTCHA routes require a valid JWT — protect is applied at router level
router.use(protect);

/**
 * @route   GET /api/captcha/current
 * @desc    Return the authenticated user's active CAPTCHA challenge.
 *          Creates a new one if none exists or the existing one has expired.
 * @access  Protected
 */
router.get('/current', captchaCurrentLimiter, getCurrentCaptcha);

/**
 * @route   POST /api/captcha/verify
 * @desc    Verify the user's CAPTCHA answer. Backend determines correctness.
 *          Reward is processed automatically on verification.
 *          correctOption is never returned in the response.
 * @access  Protected
 * @body    { challengeId: string, selectedOption: string }
 */
router.post('/verify', captchaVerifyLimiter, verifyCaptchaRules, handleValidationErrors, verifyCaptcha);

/**
 * @route   POST /api/captcha/claim
 * @desc    Claim an eligible completed reward (claimStatus PENDING → CLAIMED).
 *          Wallet is NOT modified — reward was already applied during verification.
 *          Backend controls the claim state; client cannot force claimStatus.
 * @access  Protected
 * @body    { challengeId: string }
 */
router.post('/claim', captchaClaimLimiter, claimCaptchaRules, handleValidationErrors, claimCaptcha);

/**
 * @route   POST /api/captcha/new
 * @desc    No Thanks flow — invalidate the previous challenge and generate a new one.
 *          Gems already earned are NOT deducted.
 *          correctOption is never returned in the response.
 * @access  Protected
 * @body    { previousChallengeId?: string }
 */
router.post('/new', captchaNewLimiter, newCaptchaRules, handleValidationErrors, newCaptcha);

module.exports = router;
