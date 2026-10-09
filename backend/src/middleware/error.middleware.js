/**
 * error.middleware.js — Centralized error handling middleware.
 *
 * Catches errors passed via next(err) from any route or middleware.
 * Returns consistent JSON error responses.
 * Hides internal stack traces in production.
 *
 * Mongoose-specific error mappings:
 *   CastError (invalid ObjectId)    → 400 Bad Request
 *   code 11000 (duplicate key)      → 409 Conflict
 *   ValidationError                 → 422 Unprocessable Entity
 */

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';

  // ── Mongoose CastError: invalid ObjectId or type cast failure ────────────────
  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid identifier format';
  }

  // ── MongoDB duplicate key error (E11000) ─────────────────────────────────────
  if (err.code === 11000) {
    statusCode = 409;
    const field = err.keyPattern ? Object.keys(err.keyPattern)[0] : 'field';
    message = `Duplicate value for ${field}`;
  }

  // ── Mongoose ValidationError ─────────────────────────────────────────────────
  if (err.name === 'ValidationError') {
    statusCode = 422;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
  }

  // Build the error response payload
  const response = {
    success: false,
    message,
  };

  // Attach stack trace only in development so production logs stay clean
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

/**
 * notFoundHandler — Catches requests to undefined routes.
 * Must be registered AFTER all valid routes.
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

module.exports = { errorHandler, notFoundHandler };

