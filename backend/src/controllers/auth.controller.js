/**
 * auth.controller.js — Thin controller for authentication routes.
 *
 * Each handler:
 *   1. Delegates all business logic to auth.service.js.
 *   2. Formats and sends the HTTP response.
 *   3. Forwards unexpected errors to the centralized error handler via next().
 *
 * Controllers never contain password hashing, JWT signing, or DB queries.
 */

const authService = require('../services/auth.service');

// ─── POST /api/auth/register ──────────────────────────────────────────────────

/**
 * register
 *
 * Expects a validated request body (enforced by auth.validator.js).
 * Returns a 201 with the newly created user's safe public fields.
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const user = await authService.registerUser({ name, email, password });

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: { user },
    });
  } catch (err) {
    return next(err); // centralized error handler maps statusCode → HTTP status
  }
};

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

/**
 * login
 *
 * Expects a validated request body.
 * Returns a 200 with a JWT and the user's safe public fields.
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const result = await authService.loginUser({ email, password });

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: result,
    });
  } catch (err) {
    return next(err);
  }
};

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

/**
 * me
 *
 * Protected by the `protect` middleware — req.user.id is guaranteed to be
 * the verified JWT subject.
 *
 * Fetches fresh user data from MongoDB so the response always reflects the
 * current DB state (not just the JWT snapshot).
 */
const me = async (req, res, next) => {
  try {
    // req.user.id is set exclusively by auth.middleware — never from the client
    const user = await authService.getUserById(req.user.id);

    if (!user) {
      // Edge case: valid JWT but user was deleted after token was issued
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = { register, login, me };
