/**
 * server.js — Entry point for VELoop Rewards API.
 *
 * Startup sequence:
 *   1. Load environment variables
 *   2. Create Express application
 *   3. Configure middleware (security, parsing, rate limiting)
 *   4. Register routes
 *   5. Attach error handlers
 *   6. Start HTTP server → connect MongoDB inside callback
 *
 * Stages implemented:
 *   Stage 1 — Express foundation, health check
 *   Stage 2 — JWT authentication (register / login / me)
 *   Stage 3 — CAPTCHA generation and verification
 *   Stage 4 — Gem reward processing & wallet
 *   Stage 5 — Claim + No Thanks flow
 *   Stage 6 — Security hardening, rate limiting, abuse protection
 */

// ─── 1. Load Environment Variables ───────────────────────────────────────────
require('dotenv').config();

// ─── 2. Imports ──────────────────────────────────────────────────────────────
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const connectDB = require('./src/config/db');
const healthRoutes = require('./src/routes/health.routes');
const authRoutes = require('./src/routes/auth.routes');
const captchaRoutes = require('./src/routes/captcha.routes');
const walletRoutes = require('./src/routes/wallet.routes');
const { ensureDefaultRewardConfig } = require('./src/services/reward.service');
const { errorHandler, notFoundHandler } = require('./src/middleware/error.middleware');

// ─── 3. Create Express Application ───────────────────────────────────────────
const app = express();

// Trust reverse proxy (Render, Vercel, Nginx) so req.ip and express-rate-limit correctly resolve client IPs
app.set('trust proxy', 1);

// ─── 4. Security Middleware ───────────────────────────────────────────────────

// Helmet sets secure HTTP response headers
app.use(helmet());

// CORS — origins are controlled by environment variables.
// Development: allow localhost frontend (default) or CLIENT_ORIGIN.
// Production: set FRONTEND_URL to the exact deployed origin.
const allowedOrigins = (
  process.env.FRONTEND_URL ||
  process.env.CLIENT_ORIGIN ||
  'http://localhost:3000'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    return callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions));

// Explicitly handle OPTIONS preflight for all routes.
// Without this, OPTIONS requests fall through to notFoundHandler and return 404,
// which the browser treats as a CORS failure.
app.options('*', cors(corsOptions));

// JSON body parsing — limit payload size to prevent abuse
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

// Global rate limiter — 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,  // Return rate-limit info in `RateLimit-*` headers
  legacyHeaders: false,   // Disable `X-RateLimit-*` headers
  message: {
    success: false,
    message: 'Too many requests from this IP. Please try again later.',
  },
});

app.use('/api', globalLimiter);

// ─── 5. Register Routes ───────────────────────────────────────────────────────
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/captcha', captchaRoutes);
app.use('/api/wallet', walletRoutes);

// Future route registrations will be added here:
// app.use('/api/rewards', rewardRoutes);

// ─── 6. Error Handlers ───────────────────────────────────────────────────────
// 404 — must come after all valid routes
app.use(notFoundHandler);

// Global error handler — must be last, with 4 parameters
app.use(errorHandler);

// ─── 7. Start Server then Connect to MongoDB ─────────────────────────────────
// The HTTP server starts first so the health-check endpoint is always reachable.
// MongoDB connection happens after — failure is logged clearly but does not
// prevent the server from running (load balancers can still detect it is up).
const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`[Server] VELoop API running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  await connectDB();
  // Seed the default reward config if it doesn't exist yet
  await ensureDefaultRewardConfig().catch((e) =>
    console.error('[Server] Failed to seed reward config:', e.message)
  );
});

module.exports = app; // exported for future testing
