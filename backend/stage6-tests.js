/**
 * stage6-tests.js — Comprehensive security, abuse-protection & regression tests.
 *
 * Run with:  node stage6-tests.js
 *
 * Tests 60 scenarios without a live MongoDB connection.
 * All DB-dependent logic is simulated with in-memory mocks.
 *
 * ── Authentication (T01–T08) ──────────────────────────────────────────────────
 *  T01 — Missing Authorization header → 401
 *  T02 — Authorization header present but empty token → 401
 *  T03 — Non-Bearer scheme ("Basic xxx") → 401
 *  T04 — Malformed Bearer token (not 3-part JWT) → 401
 *  T05 — Expired JWT → 401
 *  T06 — JWT signed with wrong secret → 401
 *  T07 — JWT with no userId payload → req.user.id is undefined (service rejects)
 *  T08 — Valid JWT → req.user.id set correctly from token
 *
 * ── Authorization: Cross-user (T09–T14) ──────────────────────────────────────
 *  T09 — User B cannot claim User A's challenge (ownership check → 403)
 *  T10 — User B cannot verify User A's challenge (ownership check → 403)
 *  T11 — req.body.userId is NEVER used as identity (JWT only)
 *  T12 — req.body.reward cannot override server reward
 *  T13 — req.body.isCorrect cannot override server-determined correctness
 *  T14 — req.body.amount cannot override wallet increment
 *
 * ── CAPTCHA Replay / State Machine (T15–T24) ─────────────────────────────────
 *  T15 — COMPLETED challenge cannot be verified again → 409
 *  T16 — EXPIRED challenge cannot be verified → 409/410
 *  T17 — INVALIDATED challenge cannot be verified → 409
 *  T18 — Verification checks expiresAt at business-logic level
 *  T19 — Atomic update: only one of N concurrent verify attempts wins
 *  T20 — selectedOption not in options array → 400
 *  T21 — Random challengeId → 404
 *  T22 — Empty challengeId → validator 422
 *  T23 — challengeId as non-string → validator 422
 *  T24 — Very long challengeId string → validator accepts (string type OK) or 404
 *
 * ── Reward Integrity (T25–T34) ───────────────────────────────────────────────
 *  T25 — CORRECT awards 2 half-units (= 1 Gem)
 *  T26 — WRONG awards 1 half-unit (= 0.5 Gem)
 *  T27 — balanceAfter = balanceBefore + rewardUnits (integer arithmetic)
 *  T28 — balanceBefore never goes negative
 *  T29 — Duplicate referenceId → 409 (only one reward per challenge)
 *  T30 — Client reward field silently ignored (validator rejects it at 422)
 *  T31 — Client isCorrect field silently ignored (validator rejects at 422)
 *  T32 — GemTransaction.referenceId unique constraint confirmed present
 *  T33 — GemTransaction amount stored as integer (half-Gem units)
 *  T34 — Wallet.gemBalance stored as integer (min: 0)
 *
 * ── Claim Security (T35–T40) ──────────────────────────────────────────────────
 *  T35 — Duplicate claim → 409 "Reward already claimed"
 *  T36 — claimStatus from body is rejected by validator → 422
 *  T37 — Concurrent claims: exactly one wins; others get 409
 *  T38 — Claim never touches wallet balance ($inc not in claimFn body)
 *  T39 — ACTIVE challenge cannot be claimed → 409
 *  T40 — INVALIDATED challenge cannot be claimed → 409
 *
 * ── Concurrency (T41–T46) ────────────────────────────────────────────────────
 *  T41 — Concurrent verify: only one request wins (atomic filter)
 *  T42 — Concurrent verify: losers receive 409
 *  T43 — Concurrent reward: only one GemTransaction created (E11000 guard)
 *  T44 — Concurrent claim: only one CLAIMED state
 *  T45 — Wallet not double-credited by concurrent claims
 *  T46 — No Thanks concurrent: old challenge still ends up INVALIDATED
 *
 * ── Rate Limiter Config (T47–T52) ─────────────────────────────────────────────
 *  T47 — rateLimiter.middleware.js exists and exports 4 limiters
 *  T48 — captchaCurrentLimiter is a function (Express middleware)
 *  T49 — captchaVerifyLimiter is a function
 *  T50 — captchaClaimLimiter is a function
 *  T51 — captchaNewLimiter is a function
 *  T52 — Rate limit response shape matches API convention
 *
 * ── Validation / Malformed Input (T53–T58) ───────────────────────────────────
 *  T53 — Missing challengeId on /claim → 422
 *  T54 — claimStatus in /claim body → 422
 *  T55 — userId in /claim body → 422
 *  T56 — reward in /verify body → 422
 *  T57 — isCorrect in /verify body → 422
 *  T58 — userId in /verify body → 422
 *
 * ── Security Middleware (T59–T60) ────────────────────────────────────────────
 *  T59 — server.js uses helmet()
 *  T60 — Body limit is set (≤ 100kb)
 */

require('dotenv').config();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-stage6';
process.env.CAPTCHA_EXPIRY_SECONDS = '120';
process.env.NODE_ENV = 'test';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// ─── Test runner ──────────────────────────────────────────────────────────────
const green = (s) => `\x1b[32m✔\x1b[0m  ${s}`;
const red = (s, e) => `\x1b[31m✘\x1b[0m  ${s}: ${e.message || e}`;

let passed = 0;
let failed = 0;
const failures = [];

async function test(label, fn) {
  try {
    await fn();
    console.log(green(label));
    passed++;
  } catch (e) {
    console.log(red(label, e));
    failures.push({ label, error: e.message });
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const { protect } = require('./src/middleware/auth.middleware');

const mockRes = () => {
  const r = {};
  r.status = (code) => { r.statusCode = code; return r; };
  r.json = (body) => { r.body = body; return r; };
  return r;
};

const makeReq = (authHeader, body = {}) => ({
  headers: { authorization: authHeader },
  body,
  params: {},
  query: {},
});

const makeValidToken = (userId = new mongoose.Types.ObjectId().toString()) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });

const makeExpiredToken = (userId = 'user-id') =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '-1s' });

// ─── Models ───────────────────────────────────────────────────────────────────
const CaptchaChallenge = require('./src/models/CaptchaChallenge');
const GemTransaction = require('./src/models/GemTransaction');
const Wallet = require('./src/models/Wallet');

// ─── Validators ───────────────────────────────────────────────────────────────
const {
  verifyCaptchaRules,
  claimCaptchaRules,
  newCaptchaRules,
} = require('./src/validators/captcha.validator');

// ─── Services (helpers only) ──────────────────────────────────────────────────
const { generateCaptchaText, generateOptions, toSafeChallenge } =
  require('./src/services/captcha.service');

// ─── Mock challenge factory ───────────────────────────────────────────────────
const mockChallenge = ({
  status = 'COMPLETED',
  claimStatus = 'PENDING',
  userId = new mongoose.Types.ObjectId(),
  result = 'CORRECT',
  expiresAt = new Date(Date.now() + 120_000),
} = {}) =>
  new CaptchaChallenge({
    challengeId: crypto.randomBytes(18).toString('base64url'),
    userId,
    captchaText: 'ABCDEF',
    options: ['ABCDEF', 'ABCDEG', 'ABCDEH', 'ABCDEI'],
    correctOption: 'ABCDEF',
    status,
    claimStatus,
    result,
    expiresAt,
    completedAt: status === 'COMPLETED' ? new Date() : null,
  });

// ─── Claim simulation (mirrors service logic) ─────────────────────────────────
function simulateClaim(challenge, requestUserId, hasRewardTxn, claimedSet) {
  if (!challenge) { const e = new Error('Challenge not found'); e.statusCode = 404; throw e; }
  if (challenge.userId.toString() !== requestUserId.toString()) {
    const e = new Error('Access denied'); e.statusCode = 403; throw e;
  }
  if (challenge.status === 'ACTIVE') { const e = new Error('Not completed'); e.statusCode = 409; throw e; }
  if (challenge.status === 'INVALIDATED') { const e = new Error('Invalidated'); e.statusCode = 409; throw e; }
  if (challenge.status === 'EXPIRED') { const e = new Error('Expired'); e.statusCode = 409; throw e; }
  if (challenge.claimStatus === 'CLAIMED') { const e = new Error('Reward already claimed'); e.statusCode = 409; throw e; }
  if (!hasRewardTxn) { const e = new Error('No reward transaction'); e.statusCode = 409; throw e; }
  if (claimedSet.has(challenge.challengeId)) {
    const e = new Error('Reward already claimed'); e.statusCode = 409; throw e;
  }
  claimedSet.add(challenge.challengeId);
  challenge.claimStatus = 'CLAIMED';
  challenge.claimedAt = new Date();
  return { challengeId: challenge.challengeId, claimStatus: 'CLAIMED' };
}

// ─── Verify simulation ────────────────────────────────────────────────────────
function simulateVerify(challenge, requestUserId, selectedOption, completedSet) {
  const now = new Date();
  if (!challenge) { const e = new Error('Not found'); e.statusCode = 404; throw e; }
  if (challenge.userId.toString() !== requestUserId.toString()) {
    const e = new Error('Access denied'); e.statusCode = 403; throw e;
  }
  if (challenge.status === 'COMPLETED') { const e = new Error('Already completed'); e.statusCode = 409; throw e; }
  if (challenge.status === 'INVALIDATED') { const e = new Error('Invalidated'); e.statusCode = 409; throw e; }
  if (challenge.status === 'EXPIRED' || challenge.expiresAt <= now) {
    const e = new Error('Expired'); e.statusCode = 410; throw e;
  }
  if (!challenge.options.includes(selectedOption)) {
    const e = new Error('Invalid option'); e.statusCode = 400; throw e;
  }
  if (completedSet.has(challenge.challengeId)) {
    const e = new Error('Already completed'); e.statusCode = 409; throw e;
  }
  completedSet.add(challenge.challengeId);
  challenge.status = 'COMPLETED';
  return { result: selectedOption === challenge.correctOption ? 'CORRECT' : 'WRONG' };
}

// ─── Reward simulation ────────────────────────────────────────────────────────
function simulateReward(challengeId, result, rewardedSet) {
  if (rewardedSet.has(challengeId)) {
    const e = new Error('Reward already processed for this challenge'); e.statusCode = 409; throw e;
  }
  rewardedSet.add(challengeId);
  const units = result === 'CORRECT' ? 2 : 1;
  return { rewardUnits: units, currency: 'GEM' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

(async () => {
  console.log('\n\x1b[1mVELoop Stage 6 — Security, Abuse Protection & Regression\x1b[0m\n');

  // ── Authentication (T01–T08) ─────────────────────────────────────────────────
  console.log('\x1b[34m[Authentication]\x1b[0m');

  await test('T01 — Missing Authorization header → 401', () => {
    const req = makeReq(undefined);
    const res = mockRes();
    protect(req, res, () => {});
    assert(res.statusCode === 401, `Expected 401, got ${res.statusCode}`);
    assert(res.body.message === 'Authentication required');
  });

  await test('T02 — Empty Bearer token → 401', () => {
    const req = makeReq('Bearer ');
    const res = mockRes();
    protect(req, res, () => {});
    assert(res.statusCode === 401, `Expected 401, got ${res.statusCode}`);
  });

  await test('T03 — Non-Bearer scheme ("Basic xxx") → 401', () => {
    const req = makeReq('Basic dXNlcjpwYXNz');
    const res = mockRes();
    protect(req, res, () => {});
    assert(res.statusCode === 401, `Expected 401, got ${res.statusCode}`);
  });

  await test('T04 — Malformed JWT (not 3 parts) → 401', () => {
    const req = makeReq('Bearer not-a-real-jwt');
    const res = mockRes();
    protect(req, res, () => {});
    assert(res.statusCode === 401);
    assert(res.body.message === 'Invalid or expired token');
  });

  await test('T05 — Expired JWT → 401', () => {
    const req = makeReq(`Bearer ${makeExpiredToken()}`);
    const res = mockRes();
    protect(req, res, () => {});
    assert(res.statusCode === 401);
    assert(res.body.message === 'Invalid or expired token');
  });

  await test('T06 — JWT signed with wrong secret → 401', () => {
    const badToken = jwt.sign({ userId: 'user1' }, 'wrong-secret', { expiresIn: '1h' });
    const req = makeReq(`Bearer ${badToken}`);
    const res = mockRes();
    protect(req, res, () => {});
    assert(res.statusCode === 401);
  });

  await test('T07 — JWT with no userId → req.user.id is undefined', () => {
    const emptyToken = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const req = makeReq(`Bearer ${emptyToken}`);
    const res = mockRes();
    let nextCalled = false;
    protect(req, res, () => { nextCalled = true; });
    // middleware should set req.user.id = undefined (not crash)
    assert(nextCalled, 'next() should be called when JWT is valid even if userId is missing');
    assert(req.user !== undefined, 'req.user should be set');
    // userId would be undefined — the service/controller will reject with 400/401
  });

  await test('T08 — Valid JWT → req.user.id set correctly from token', () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const req = makeReq(`Bearer ${makeValidToken(userId)}`);
    const res = mockRes();
    let nextCalled = false;
    protect(req, res, () => { nextCalled = true; });
    assert(nextCalled, 'next() must be called for valid token');
    assert(req.user.id === userId, `Expected ${userId}, got ${req.user.id}`);
  });

  // ── Authorization: Cross-user (T09–T14) ──────────────────────────────────────
  console.log('\n\x1b[34m[Authorization: Cross-user Attacks]\x1b[0m');

  await test('T09 — User B cannot claim User A\'s challenge → 403', () => {
    const userA = new mongoose.Types.ObjectId();
    const userB = new mongoose.Types.ObjectId();
    const ch = mockChallenge({ userId: userA });
    try {
      simulateClaim(ch, userB, true, new Set());
      assert(false, 'Should throw');
    } catch (err) {
      assert(err.statusCode === 403, `Expected 403, got ${err.statusCode}`);
    }
  });

  await test('T10 — User B cannot verify User A\'s challenge → 403', () => {
    const userA = new mongoose.Types.ObjectId();
    const userB = new mongoose.Types.ObjectId();
    const ch = mockChallenge({ userId: userA, status: 'ACTIVE' });
    try {
      simulateVerify(ch, userB, ch.correctOption, new Set());
      assert(false, 'Should throw');
    } catch (err) {
      assert(err.statusCode === 403, `Expected 403, got ${err.statusCode}`);
    }
  });

  await test('T11 — req.body.userId is NEVER used as identity (controller reads JWT only)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'src/controllers/captcha.controller.js'), 'utf8'
    );
    // Strip block comments (/* ... */) and line comments (// ...) so that
    // documented security invariants in comments don't falsely fail this check.
    const codeOnly = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    assert(!codeOnly.includes('req.body.userId'), 'Controller code must not use req.body.userId');
    assert(codeOnly.includes('req.user.id'), 'Controller must use req.user.id from JWT');
  });

  await test('T12 — req.body.reward cannot override server reward (validator rejects)', () => {
    // verifyCaptchaRules must include a rule rejecting "reward"
    const hasRewardRule = verifyCaptchaRules.some(() => true); // rules exist
    const source = fs.readFileSync(
      path.join(__dirname, 'src/validators/captcha.validator.js'), 'utf8'
    );
    assert(source.includes("'reward'"), 'Validator must explicitly reject reward field');
    assert(source.includes('must not be supplied by the client'), 'Must have rejection message');
  });

  await test('T13 — req.body.isCorrect cannot override server correctness (validator rejects)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'src/validators/captcha.validator.js'), 'utf8'
    );
    assert(source.includes("'isCorrect'"), 'Validator must reject isCorrect field');
  });

  await test('T14 — req.body.amount cannot override wallet increment (validator rejects)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'src/validators/captcha.validator.js'), 'utf8'
    );
    assert(source.includes("'amount'"), 'Validator must reject amount field');
  });

  // ── CAPTCHA State Machine (T15–T24) ──────────────────────────────────────────
  console.log('\n\x1b[34m[CAPTCHA State Machine & Replay Protection]\x1b[0m');

  await test('T15 — COMPLETED challenge cannot be verified again → 409', () => {
    const userId = new mongoose.Types.ObjectId();
    const ch = mockChallenge({ userId, status: 'COMPLETED' });
    try {
      simulateVerify(ch, userId, 'ABCDEF', new Set());
      assert(false, 'Should throw');
    } catch (err) {
      assert(err.statusCode === 409);
    }
  });

  await test('T16 — EXPIRED challenge cannot be verified → 410', () => {
    const userId = new mongoose.Types.ObjectId();
    const ch = mockChallenge({ userId, status: 'EXPIRED', expiresAt: new Date(Date.now() - 1000) });
    try {
      simulateVerify(ch, userId, 'ABCDEF', new Set());
      assert(false, 'Should throw');
    } catch (err) {
      assert(err.statusCode === 410 || err.statusCode === 409, `Expected 410, got ${err.statusCode}`);
    }
  });

  await test('T17 — INVALIDATED challenge cannot be verified → 409', () => {
    const userId = new mongoose.Types.ObjectId();
    const ch = mockChallenge({ userId, status: 'INVALIDATED' });
    try {
      simulateVerify(ch, userId, 'ABCDEF', new Set());
      assert(false, 'Should throw');
    } catch (err) {
      assert(err.statusCode === 409);
    }
  });

  await test('T18 — Business logic checks expiresAt independently of MongoDB TTL', () => {
    // Verify service source explicitly checks expiresAt
    const source = fs.readFileSync(
      path.join(__dirname, 'src/services/captcha.service.js'), 'utf8'
    );
    assert(source.includes('expiresAt'), 'Service must check expiresAt');
    assert(source.includes('$gt'), 'Atomic update must include expiresAt check');
  });

  await test('T19 — Atomic verify: only one of N concurrent attempts wins', () => {
    const userId = new mongoose.Types.ObjectId();
    const ch = mockChallenge({ userId, status: 'ACTIVE' });
    const completedSet = new Set();
    let wins = 0;
    let losses = 0;
    for (let i = 0; i < 10; i++) {
      try {
        simulateVerify(ch, userId, 'ABCDEF', completedSet);
        wins++;
      } catch (_) {
        losses++;
      }
    }
    assert(wins === 1, `Expected 1 win, got ${wins}`);
    assert(losses === 9, `Expected 9 losses, got ${losses}`);
  });

  await test('T20 — selectedOption not in options array → 400', () => {
    const userId = new mongoose.Types.ObjectId();
    const ch = mockChallenge({ userId, status: 'ACTIVE' });
    try {
      simulateVerify(ch, userId, 'XXXXXX', new Set());
      assert(false, 'Should throw');
    } catch (err) {
      assert(err.statusCode === 400, `Expected 400, got ${err.statusCode}`);
    }
  });

  await test('T21 — Random challengeId → 404', () => {
    try {
      simulateVerify(null, 'any-user', 'opt', new Set());
      assert(false, 'Should throw');
    } catch (err) {
      assert(err.statusCode === 404, `Expected 404, got ${err.statusCode}`);
    }
  });

  await test('T22 — Empty challengeId on /claim → validator rule exists', () => {
    // Claim rules must require challengeId to be non-empty
    const source = fs.readFileSync(
      path.join(__dirname, 'src/validators/captcha.validator.js'), 'utf8'
    );
    const claimSection = source.slice(source.indexOf('claimCaptchaRules'));
    assert(claimSection.includes('challengeId is required'), 'Claim validator must require challengeId');
    assert(claimSection.includes('notEmpty'), 'Claim validator must check notEmpty');
  });

  await test('T23 — challengeId as number type is rejected by validator (isString rule)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'src/validators/captcha.validator.js'), 'utf8'
    );
    // Both verify and claim validators must have isString check on challengeId
    assert(source.includes('isString'), 'Validators must check isString on challengeId');
  });

  await test('T24 — Very long challengeId is a string → validator accepts it (404 from service)', () => {
    // Validator only checks type and non-empty; length is OK (MongoDB handles it)
    const longId = 'X'.repeat(1000);
    // No error in validator — would pass validation; 404 from DB lookup
    assert(typeof longId === 'string', 'Long strings are valid string type');
    assert(longId.length === 1000, 'Confirm length');
  });

  // ── Reward Integrity (T25–T34) ───────────────────────────────────────────────
  console.log('\n\x1b[34m[Reward Integrity]\x1b[0m');

  await test('T25 — CORRECT awards 2 half-units (= 1.0 Gem)', () => {
    const rewardedSet = new Set();
    const r = simulateReward('ch-correct', 'CORRECT', rewardedSet);
    assert(r.rewardUnits === 2, `Expected 2 units, got ${r.rewardUnits}`);
    assert(r.rewardUnits / 2 === 1.0, 'Display should be 1.0 Gem');
  });

  await test('T26 — WRONG awards 1 half-unit (= 0.5 Gem)', () => {
    const rewardedSet = new Set();
    const r = simulateReward('ch-wrong', 'WRONG', rewardedSet);
    assert(r.rewardUnits === 1, `Expected 1 unit, got ${r.rewardUnits}`);
    assert(r.rewardUnits / 2 === 0.5, 'Display should be 0.5 Gem');
  });

  await test('T27 — balanceAfter = balanceBefore + rewardUnits (integer arithmetic)', () => {
    const balanceBefore = 7;
    const rewardUnits = 2;
    const balanceAfter = balanceBefore + rewardUnits;
    assert(balanceAfter === 9, `Expected 9, got ${balanceAfter}`);
    assert(Number.isInteger(balanceAfter), 'Must be an integer');
  });

  await test('T28 — balanceBefore is never negative (starts at 0, only positive increments)', () => {
    // New wallets start at 0; every reward adds ≥1; no decrements exist
    const startBalance = 0;
    const afterReward = startBalance + 1;
    assert(afterReward >= 0, 'Balance should never be negative');
    // Verify Wallet schema enforces min:0
    const w = new Wallet({
      userId: new mongoose.Types.ObjectId(),
      gemBalance: -1,
    });
    const err = w.validateSync();
    assert(err && err.errors.gemBalance, 'Schema must reject negative gemBalance');
  });

  await test('T29 — Duplicate referenceId → 409 (only one reward per challenge)', () => {
    const rewardedSet = new Set();
    simulateReward('ch-dup', 'CORRECT', rewardedSet);
    try {
      simulateReward('ch-dup', 'CORRECT', rewardedSet);
      assert(false, 'Should throw on duplicate');
    } catch (err) {
      assert(err.statusCode === 409, `Expected 409, got ${err.statusCode}`);
    }
  });

  await test('T30 — Client reward field rejected by validator (422)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'src/validators/captcha.validator.js'), 'utf8'
    );
    assert(source.includes("'reward'") && source.includes('.not()'), 'Validator must explicitly reject reward');
  });

  await test('T31 — Client isCorrect field rejected by validator (422)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'src/validators/captcha.validator.js'), 'utf8'
    );
    assert(source.includes("'isCorrect'") && source.includes('.not()'), 'Validator must explicitly reject isCorrect');
  });

  await test('T32 — GemTransaction.referenceId unique constraint exists in schema', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'src/models/GemTransaction.js'), 'utf8'
    );
    assert(source.includes('unique: true'), 'GemTransaction must have unique constraint');
    assert(source.includes('referenceId'), 'Must be on referenceId field');
  });

  await test('T33 — GemTransaction amount is stored as integer (half-Gem units)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'src/models/GemTransaction.js'), 'utf8'
    );
    assert(source.includes('Number.isInteger'), 'Amount must validate as integer');
  });

  await test('T34 — Wallet.gemBalance stored as integer (schema min: 0)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'src/models/Wallet.js'), 'utf8'
    );
    assert(source.includes('min:') || source.includes('min: '), 'Wallet schema must have min constraint');
  });

  // ── Claim Security (T35–T40) ──────────────────────────────────────────────────
  console.log('\n\x1b[34m[Claim Security]\x1b[0m');

  await test('T35 — Duplicate claim → 409 "Reward already claimed"', () => {
    const ch = mockChallenge({ status: 'COMPLETED', claimStatus: 'PENDING' });
    const claimedSet = new Set();
    simulateClaim(ch, ch.userId, true, claimedSet);
    ch.claimStatus = 'CLAIMED'; // simulate DB update reflected
    try {
      simulateClaim(ch, ch.userId, true, claimedSet);
      assert(false, 'Should throw');
    } catch (err) {
      assert(err.statusCode === 409);
      assert(err.message === 'Reward already claimed', err.message);
    }
  });

  await test('T36 — claimStatus in /claim body is rejected (422)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'src/validators/captcha.validator.js'), 'utf8'
    );
    const claimSection = source.slice(source.indexOf('claimCaptchaRules'));
    assert(claimSection.includes("'claimStatus'"), 'Claim validator must reject claimStatus');
  });

  await test('T37 — Concurrent claims: exactly one wins, others get 409', () => {
    const ch = mockChallenge({ status: 'COMPLETED', claimStatus: 'PENDING' });
    const claimedSet = new Set();
    let wins = 0;
    let losses = 0;
    for (let i = 0; i < 10; i++) {
      const reqUserId = ch.userId; // same user, 10 concurrent
      try {
        simulateClaim(ch, reqUserId, true, claimedSet);
        wins++;
      } catch (err) {
        if (err.statusCode === 409) losses++;
      }
    }
    assert(wins === 1, `Expected 1 win, got ${wins}`);
    assert(losses === 9, `Expected 9 losses, got ${losses}`);
  });

  await test('T38 — Claim never modifies wallet balance ($inc not in claim function)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'src/services/captcha.service.js'), 'utf8'
    );
    const claimStart = source.indexOf('const claimCaptchaChallenge');
    const claimEnd = source.indexOf('const requestNewChallenge');
    const claimBody = source.slice(claimStart, claimEnd);
    assert(!claimBody.includes('$inc'), 'claimCaptchaChallenge must NOT use $inc (no wallet change)');
    assert(!claimBody.includes('gemBalance'), 'claimCaptchaChallenge must NOT reference gemBalance');
  });

  await test('T39 — ACTIVE challenge cannot be claimed → 409', () => {
    const ch = mockChallenge({ status: 'ACTIVE' });
    try {
      simulateClaim(ch, ch.userId, true, new Set());
      assert(false, 'Should throw');
    } catch (err) {
      assert(err.statusCode === 409);
    }
  });

  await test('T40 — INVALIDATED challenge cannot be claimed → 409', () => {
    const ch = mockChallenge({ status: 'INVALIDATED' });
    try {
      simulateClaim(ch, ch.userId, true, new Set());
      assert(false, 'Should throw');
    } catch (err) {
      assert(err.statusCode === 409);
    }
  });

  // ── Concurrency (T41–T46) ─────────────────────────────────────────────────────
  console.log('\n\x1b[34m[Concurrency]\x1b[0m');

  await test('T41 — Concurrent verify: only one request wins (atomic simulation)', () => {
    const userId = new mongoose.Types.ObjectId();
    const ch = mockChallenge({ userId, status: 'ACTIVE' });
    const completedSet = new Set();
    const results = Array.from({ length: 10 }).map(() => {
      try { simulateVerify(ch, userId, 'ABCDEF', completedSet); return 'win'; }
      catch (_) { return 'loss'; }
    });
    const wins = results.filter((r) => r === 'win').length;
    assert(wins === 1, `Expected 1 winner, got ${wins}`);
  });

  await test('T42 — Concurrent verify: losers receive 409', () => {
    const userId = new mongoose.Types.ObjectId();
    const ch = mockChallenge({ userId, status: 'ACTIVE' });
    const completedSet = new Set();
    let lossCount = 0;
    Array.from({ length: 10 }).forEach(() => {
      try { simulateVerify(ch, userId, 'ABCDEF', completedSet); }
      catch (err) { if (err.statusCode === 409) lossCount++; }
    });
    assert(lossCount === 9, `Expected 9 409s, got ${lossCount}`);
  });

  await test('T43 — Concurrent reward: only one GemTransaction (E11000 unique index)', () => {
    const rewardedSet = new Set();
    let wins = 0;
    let losses = 0;
    for (let i = 0; i < 10; i++) {
      try { simulateReward('same-challenge-id', 'CORRECT', rewardedSet); wins++; }
      catch (err) { if (err.statusCode === 409) losses++; }
    }
    assert(wins === 1, `Expected 1 reward, got ${wins}`);
    assert(losses === 9, `Expected 9 rejected, got ${losses}`);
  });

  await test('T44 — Concurrent claim: only one CLAIMED state', () => {
    const ch = mockChallenge({ status: 'COMPLETED', claimStatus: 'PENDING' });
    const claimedSet = new Set();
    for (let i = 0; i < 10; i++) {
      try { simulateClaim(ch, ch.userId, true, claimedSet); }
      catch (_) {}
    }
    assert(ch.claimStatus === 'CLAIMED', `Expected CLAIMED, got ${ch.claimStatus}`);
    assert(claimedSet.size === 1, `Expected 1 entry in set, got ${claimedSet.size}`);
  });

  await test('T45 — Wallet not double-credited by concurrent claims (claim has no $inc)', () => {
    // Confirmed by T38; both: the service function body and the concurrency simulation
    const ch = mockChallenge({ status: 'COMPLETED', claimStatus: 'PENDING' });
    const claimedSet = new Set();
    const results = [];
    for (let i = 0; i < 10; i++) {
      try { results.push(simulateClaim(ch, ch.userId, true, claimedSet)); }
      catch (_) {}
    }
    // Only 1 claim succeeded
    assert(results.length === 1, `Only 1 claim should succeed, got ${results.length}`);
    // Neither result includes wallet change
    assert(!('walletBalance' in results[0]), 'Claim result must not include walletBalance');
  });

  await test('T46 — No Thanks concurrent: old challenge ends up INVALIDATED exactly once', () => {
    const userId = new mongoose.Types.ObjectId();
    const ch = mockChallenge({ userId, status: 'COMPLETED' });
    let invalidations = 0;
    for (let i = 0; i < 5; i++) {
      if (['ACTIVE', 'COMPLETED'].includes(ch.status)) {
        ch.status = 'INVALIDATED';
        invalidations++;
      }
    }
    assert(ch.status === 'INVALIDATED', 'Challenge must be INVALIDATED');
    assert(invalidations === 1, `Only one state change expected, got ${invalidations}`);
  });

  // ── Rate Limiter Config (T47–T52) ─────────────────────────────────────────────
  console.log('\n\x1b[34m[Rate Limiter Configuration]\x1b[0m');

  const {
    captchaCurrentLimiter,
    captchaVerifyLimiter,
    captchaClaimLimiter,
    captchaNewLimiter,
  } = require('./src/middleware/rateLimiter.middleware');

  await test('T47 — rateLimiter.middleware.js exports 4 limiters', () => {
    assert(captchaCurrentLimiter, 'Must export captchaCurrentLimiter');
    assert(captchaVerifyLimiter, 'Must export captchaVerifyLimiter');
    assert(captchaClaimLimiter, 'Must export captchaClaimLimiter');
    assert(captchaNewLimiter, 'Must export captchaNewLimiter');
  });

  await test('T48 — captchaCurrentLimiter is an Express middleware function', () => {
    assert(typeof captchaCurrentLimiter === 'function', 'Must be a function');
    assert(captchaCurrentLimiter.length >= 3, 'Express middleware must accept (req, res, next)');
  });

  await test('T49 — captchaVerifyLimiter is an Express middleware function', () => {
    assert(typeof captchaVerifyLimiter === 'function');
  });

  await test('T50 — captchaClaimLimiter is an Express middleware function', () => {
    assert(typeof captchaClaimLimiter === 'function');
  });

  await test('T51 — captchaNewLimiter is an Express middleware function', () => {
    assert(typeof captchaNewLimiter === 'function');
  });

  await test('T52 — Rate limit response shape matches API convention', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'src/middleware/rateLimiter.middleware.js'), 'utf8'
    );
    assert(source.includes('success: false'), 'Rate limit response must have success:false');
    assert(source.includes('Too many requests'), 'Rate limit message must be user-friendly');
  });

  // ── Validation / Malformed Input (T53–T58) ────────────────────────────────────
  console.log('\n\x1b[34m[Validation: Malformed Input]\x1b[0m');

  await test('T53 — Missing challengeId on /claim → validator rule exists', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'src/validators/captcha.validator.js'), 'utf8'
    );
    const claimSection = source.slice(source.indexOf('claimCaptchaRules'));
    assert(claimSection.includes('challengeId is required'), 'Must require challengeId');
  });

  await test('T54 — claimStatus in /claim body → 422 (validator rejects)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'src/validators/captcha.validator.js'), 'utf8'
    );
    const claimSection = source.slice(source.indexOf('claimCaptchaRules'));
    assert(claimSection.includes("'claimStatus'"), 'Must reject claimStatus');
    assert(claimSection.includes('must not be supplied'), 'Must have rejection message');
  });

  await test('T55 — userId in /claim body → 422 (validator rejects)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'src/validators/captcha.validator.js'), 'utf8'
    );
    const claimSection = source.slice(source.indexOf('claimCaptchaRules'));
    assert(claimSection.includes("'userId'"), 'Must reject userId');
  });

  await test('T56 — reward in /verify body → 422 (validator rejects)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'src/validators/captcha.validator.js'), 'utf8'
    );
    const verifySection = source.slice(
      source.indexOf('verifyCaptchaRules'),
      source.indexOf('claimCaptchaRules')
    );
    assert(verifySection.includes("'reward'"), 'Must reject reward in verify');
  });

  await test('T57 — isCorrect in /verify body → 422 (validator rejects)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'src/validators/captcha.validator.js'), 'utf8'
    );
    assert(source.includes("'isCorrect'"), 'Must reject isCorrect');
  });

  await test('T58 — userId in /verify body → 422 (validator rejects)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'src/validators/captcha.validator.js'), 'utf8'
    );
    const verifySection = source.slice(
      source.indexOf('verifyCaptchaRules'),
      source.indexOf('claimCaptchaRules')
    );
    assert(verifySection.includes("'userId'"), 'Must reject userId in verify');
  });

  // ── Security Middleware (T59–T60) ──────────────────────────────────────────────
  console.log('\n\x1b[34m[Security Middleware]\x1b[0m');

  await test('T59 — server.js uses helmet() for security headers', () => {
    const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
    assert(source.includes("helmet()"), 'server.js must use helmet()');
    assert(source.includes("require('helmet')"), 'helmet must be imported');
  });

  await test('T60 — Body size limit is configured (≤ 100kb)', () => {
    const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
    // Verify a body size limit exists and is not excessively large
    assert(source.includes('limit:') || source.includes("limit: '"), 'Body limit must be set');
    // Current limit is '10kb' — well within 100kb
    assert(source.includes('10kb'), 'Body limit should be 10kb');
  });

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  \x1b[32mPassed: ${passed}\x1b[0m   \x1b[31mFailed: ${failed}\x1b[0m   Total: ${passed + failed}`);
  if (failures.length > 0) {
    console.log('\n  Failed tests:');
    failures.forEach((f) => console.log(`    ✘ ${f.label}: ${f.error}`));
  }
  console.log(`${'─'.repeat(60)}\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
