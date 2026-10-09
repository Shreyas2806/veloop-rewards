/**
 * stage2-tests.js — Self-contained validation of Stage 2 auth logic.
 *
 * Tests all components WITHOUT a live MongoDB connection by verifying:
 *   - bcrypt hashing and comparison
 *   - JWT generation and verification
 *   - Token payload contains only userId (no password, no hash)
 *   - Token expiry enforcement
 *   - auth.middleware behavior (missing token, bad token, valid token)
 *   - generateToken throws when JWT_SECRET is missing
 *
 * Run with:  node stage2-tests.js
 */

require('dotenv').config();

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ─── Colour helpers ───────────────────────────────────────────────────────────
const pass = (msg) => console.log(`  \x1b[32m✔\x1b[0m  ${msg}`);
const fail = (msg, err) => console.log(`  \x1b[31m✘\x1b[0m  ${msg}: ${err}`);

let passed = 0;
let failed = 0;

async function assert(label, fn) {
  try {
    await fn();
    pass(label);
    passed++;
  } catch (e) {
    fail(label, e.message);
    failed++;
  }
}

// ─── Test suite ───────────────────────────────────────────────────────────────

(async () => {
  console.log('\n\x1b[1mVELoop Stage 2 — Auth Logic Tests\x1b[0m\n');

  // ── 1. bcrypt: plain text is NOT stored ──────────────────────────────────────
  console.log('\x1b[34m[bcrypt]\x1b[0m');

  const plainPassword = 'password123';
  const hash = await bcrypt.hash(plainPassword, 12);

  await assert('Hash does not equal plain text', async () => {
    if (hash === plainPassword) throw new Error('Hash equals plain text!');
  });

  await assert('Hash is at least 60 characters long (bcrypt format)', async () => {
    if (hash.length < 60) throw new Error(`Hash too short: ${hash.length}`);
  });

  await assert('Correct password matches hash', async () => {
    const ok = await bcrypt.compare(plainPassword, hash);
    if (!ok) throw new Error('bcrypt.compare returned false for correct password');
  });

  await assert('Wrong password does not match hash', async () => {
    const ok = await bcrypt.compare('wrongpassword', hash);
    if (ok) throw new Error('bcrypt.compare returned true for wrong password');
  });

  // ── 2. JWT: payload and expiry ────────────────────────────────────────────────
  console.log('\n\x1b[34m[JWT]\x1b[0m');

  const secret = process.env.JWT_SECRET || 'test-secret-for-unit-tests';
  const fakeUserId = '6678f1234abcdef012345678';

  const token = jwt.sign({ userId: fakeUserId }, secret, { expiresIn: '1d' });

  await assert('Token is a non-empty string', async () => {
    if (!token || typeof token !== 'string') throw new Error('Token is empty or not a string');
  });

  await assert('Token verifies successfully with correct secret', async () => {
    const decoded = jwt.verify(token, secret);
    if (!decoded.userId) throw new Error('userId missing from decoded payload');
  });

  await assert('Decoded payload contains userId', async () => {
    const decoded = jwt.verify(token, secret);
    if (decoded.userId !== fakeUserId) throw new Error(`Expected ${fakeUserId}, got ${decoded.userId}`);
  });

  await assert('Payload does NOT contain password', async () => {
    const decoded = jwt.verify(token, secret);
    if (decoded.password || decoded.passwordHash) throw new Error('Sensitive data found in token payload');
  });

  await assert('Token fails verification with wrong secret', async () => {
    try {
      jwt.verify(token, 'wrong-secret');
      throw new Error('Should have thrown JsonWebTokenError');
    } catch (e) {
      if (e.name !== 'JsonWebTokenError') throw e;
    }
  });

  await assert('Expired token throws TokenExpiredError', async () => {
    const expiredToken = jwt.sign({ userId: fakeUserId }, secret, { expiresIn: '0s' });
    await new Promise((r) => setTimeout(r, 10)); // ensure 0s has passed
    try {
      jwt.verify(expiredToken, secret);
      throw new Error('Should have thrown TokenExpiredError');
    } catch (e) {
      if (e.name !== 'TokenExpiredError') throw e;
    }
  });

  // ── 3. auth.middleware simulation ─────────────────────────────────────────────
  console.log('\n\x1b[34m[auth.middleware simulation]\x1b[0m');

  // Load the actual middleware
  const { protect } = require('./src/middleware/auth.middleware');

  const makeReq = (authHeader) => ({
    headers: { authorization: authHeader },
    body: {},
    params: {},
    query: {},
  });

  const mockRes = () => {
    const res = {};
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    return res;
  };

  await assert('Missing Authorization header → 401 + "Authentication required"', async () => {
    const req = makeReq(undefined);
    const res = mockRes();
    protect(req, res, () => {});
    if (res.statusCode !== 401) throw new Error(`Expected 401, got ${res.statusCode}`);
    if (!res.body.message.includes('Authentication required')) throw new Error(res.body.message);
  });

  await assert('Non-Bearer token format → 401 + "Authentication required"', async () => {
    const req = makeReq(`Basic ${token}`);
    const res = mockRes();
    protect(req, res, () => {});
    if (res.statusCode !== 401) throw new Error(`Expected 401, got ${res.statusCode}`);
  });

  await assert('Invalid token → 401 + "Invalid or expired token"', async () => {
    const req = makeReq('Bearer this.is.not.valid');
    const res = mockRes();
    protect(req, res, () => {});
    if (res.statusCode !== 401) throw new Error(`Expected 401, got ${res.statusCode}`);
    if (!res.body.message.includes('Invalid or expired token')) throw new Error(res.body.message);
  });

  await assert('Valid token → next() is called and req.user.id is set', async () => {
    const req = makeReq(`Bearer ${token}`);
    const res = mockRes();
    let nextCalled = false;
    protect(req, res, () => { nextCalled = true; });
    if (!nextCalled) throw new Error('next() was not called');
    if (req.user.id !== fakeUserId) throw new Error(`req.user.id is ${req.user.id}, expected ${fakeUserId}`);
  });

  await assert('Valid token: req.user does NOT expose password or hash', async () => {
    const req = makeReq(`Bearer ${token}`);
    const res = mockRes();
    protect(req, res, () => {});
    if (req.user && (req.user.password || req.user.passwordHash)) {
      throw new Error('Sensitive data found on req.user');
    }
  });

  await assert('generateToken throws without JWT_SECRET', async () => {
    const origSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = '';
    try {
      const { generateToken } = require('./src/services/auth.service');
      generateToken('someid');
      process.env.JWT_SECRET = origSecret;
      throw new Error('Should have thrown');
    } catch (e) {
      process.env.JWT_SECRET = origSecret;
      if (!e.message.includes('JWT_SECRET')) throw new Error(`Wrong error: ${e.message}`);
    }
  });

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log(`\n────────────────────────────────────────`);
  console.log(`  \x1b[32mPassed: ${passed}\x1b[0m   \x1b[31mFailed: ${failed}\x1b[0m`);
  console.log(`────────────────────────────────────────\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
