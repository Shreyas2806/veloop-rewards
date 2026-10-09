/**
 * auth.validator.js — express-validator rule sets for authentication routes.
 *
 * Each exported array is used directly in the route definition.
 * Validation errors are caught by the validationResult() call inside
 * the controller (or a shared helper) and returned in a consistent format.
 */

const { body, validationResult } = require('express-validator');

// ─── Reusable field rules ─────────────────────────────────────────────────────

const nameRules = body('name')
  .trim()
  .notEmpty()
  .withMessage('Name is required')
  .isLength({ max: 100 })
  .withMessage('Name cannot exceed 100 characters');

const emailRules = body('email')
  .trim()
  .notEmpty()
  .withMessage('Email is required')
  .isEmail()
  .withMessage('Valid email address is required')
  .normalizeEmail(); // lower-case + strip dots/aliases

const passwordRules = body('password')
  .notEmpty()
  .withMessage('Password is required')
  .isLength({ min: 8 })
  .withMessage('Password must be at least 8 characters');

// ─── Rule sets per route ──────────────────────────────────────────────────────

/** Rules applied to POST /api/auth/register */
const registerValidationRules = [nameRules, emailRules, passwordRules];

/** Rules applied to POST /api/auth/login */
const loginValidationRules = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Valid email address is required')
    .normalizeEmail(),

  body('password').notEmpty().withMessage('Password is required'),
];

// ─── Middleware: evaluate collected rules and return errors if any ─────────────
/**
 * handleValidationErrors
 *
 * Call this as the last entry in any route's validator array.
 * If express-validator found problems it sends a 422 response immediately.
 * Otherwise it calls next() and the request reaches the controller.
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formatted = errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
    }));

    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: formatted,
    });
  }
  return next();
};

module.exports = {
  registerValidationRules,
  loginValidationRules,
  handleValidationErrors,
};
