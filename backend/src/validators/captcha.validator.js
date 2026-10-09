/**
 * captcha.validator.js — express-validator rule sets for CAPTCHA routes.
 *
 * Follows the same pattern as auth.validator.js:
 *  - Export a rule array per route.
 *  - Use the shared handleValidationErrors middleware (re-exported here for
 *    convenience so routes only need one import).
 *
 * Security notes:
 *  - Neither isCorrect, reward, userId, nor claimStatus fields are accepted
 *    because the server ignores them entirely — they never reach the service layer.
 *  - userId is always sourced from req.user.id (set by auth.middleware).
 */

const { body } = require('express-validator');
const { handleValidationErrors } = require('./auth.validator');

// ─── POST /api/captcha/verify ─────────────────────────────────────────────────

const verifyCaptchaRules = [
  body('challengeId')
    .trim()
    .notEmpty()
    .withMessage('challengeId is required')
    .isString()
    .withMessage('challengeId must be a string'),

  body('selectedOption')
    .trim()
    .notEmpty()
    .withMessage('selectedOption is required')
    .isString()
    .withMessage('selectedOption must be a string'),

  // Explicitly reject any client-supplied fields that could be used for spoofing.
  body('isCorrect')
    .not()
    .exists()
    .withMessage('isCorrect must not be supplied by the client'),

  body('reward')
    .not()
    .exists()
    .withMessage('reward must not be supplied by the client'),

  body('userId')
    .not()
    .exists()
    .withMessage('userId must not be supplied by the client'),
];

// ─── POST /api/captcha/claim ──────────────────────────────────────────────────

const claimCaptchaRules = [
  body('challengeId')
    .trim()
    .notEmpty()
    .withMessage('challengeId is required')
    .isString()
    .withMessage('challengeId must be a string'),

  // Reject fields that could be used to spoof claim state
  body('claimStatus')
    .not()
    .exists()
    .withMessage('claimStatus must not be supplied by the client'),

  body('userId')
    .not()
    .exists()
    .withMessage('userId must not be supplied by the client'),

  body('reward')
    .not()
    .exists()
    .withMessage('reward must not be supplied by the client'),

  body('amount')
    .not()
    .exists()
    .withMessage('amount must not be supplied by the client'),
];

// ─── POST /api/captcha/new ────────────────────────────────────────────────────

const newCaptchaRules = [
  // previousChallengeId is optional but must be a non-empty string if supplied
  body('previousChallengeId')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('previousChallengeId must not be an empty string if supplied')
    .isString()
    .withMessage('previousChallengeId must be a string'),

  // Reject spoofed fields
  body('userId')
    .not()
    .exists()
    .withMessage('userId must not be supplied by the client'),

  body('claimStatus')
    .not()
    .exists()
    .withMessage('claimStatus must not be supplied by the client'),
];

module.exports = {
  verifyCaptchaRules,
  claimCaptchaRules,
  newCaptchaRules,
  handleValidationErrors, // re-export so captcha.routes.js has one import
};
