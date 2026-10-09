/**
 * auth.routes.js — Route definitions for the authentication module.
 *
 * Mounted in server.js as:  app.use('/api/auth', authRoutes)
 *
 * Public routes  (no JWT required):
 *   POST /api/auth/register
 *   POST /api/auth/login
 *
 * Protected routes (JWT required):
 *   GET  /api/auth/me
 *
 * Each route applies its own rate limiter in addition to the global limiter
 * to prevent brute-force and enumeration attacks.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');

const { register, login, me } = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');
const {
  registerValidationRules,
  loginValidationRules,
  handleValidationErrors,
} = require('../validators/auth.validator');

const router = express.Router();

// ─── Auth-specific rate limiter ───────────────────────────────────────────────
// Stricter than the global limiter — 20 attempts per 15 minutes per IP.
// Protects against credential-stuffing and brute-force attacks.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again later.',
  },
});

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user account
 * @access  Public
 */
router.post(
  '/register',
  authLimiter,
  registerValidationRules,
  handleValidationErrors,
  register
);

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and return a JWT
 * @access  Public
 */
router.post(
  '/login',
  authLimiter,
  loginValidationRules,
  handleValidationErrors,
  login
);

/**
 * @route   GET /api/auth/me
 * @desc    Return the currently authenticated user's profile
 * @access  Protected (JWT required)
 */
router.get('/me', protect, me);

module.exports = router;
