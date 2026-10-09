/**
 * auth.middleware.js — JWT authentication guard.
 *
 * Usage:
 *   router.get('/me', protect, meController);
 *
 * Flow:
 *   1. Read the Authorization header.
 *   2. Expect the format:  Authorization: Bearer <token>
 *   3. Verify the token with JWT_SECRET.
 *   4. Extract userId from the verified payload.
 *   5. Attach { id } to req.user.
 *   6. Call next() to reach the protected controller.
 *
 * Security guarantees:
 *   - req.body.userId / req.params.userId are NEVER used as identity.
 *   - The user's identity comes exclusively from the signed JWT.
 *   - Tokens that are missing, malformed, or expired are rejected with 401.
 *   - No sensitive information is logged.
 */

const jwt = require('jsonwebtoken');

/**
 * protect — Express middleware that enforces JWT authentication.
 *
 * Attaches req.user = { id: <userId> } on success.
 * Calls next(err) on failure so the centralized error handler responds.
 */
const protect = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // ── 1. Ensure the header is present and correctly formatted ────────────────
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
  }

  // ── 2. Extract the raw token ────────────────────────────────────────────────
  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
  }

  // ── 3. Verify and decode ────────────────────────────────────────────────────
  try {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      // This is a server misconfiguration — log it but return a generic 500
      console.error('[Auth] FATAL: JWT_SECRET is not configured');
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }

    const decoded = jwt.verify(token, secret);

    // ── 4. Attach minimal identity to the request object ────────────────────
    // Only the verified userId from the JWT is trusted.
    // req.body, req.params, and req.query are NEVER used as identity.
    req.user = { id: decoded.userId };

    return next();
  } catch (err) {
    // jwt.verify throws JsonWebTokenError, TokenExpiredError, NotBeforeError
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
};

module.exports = { protect };
