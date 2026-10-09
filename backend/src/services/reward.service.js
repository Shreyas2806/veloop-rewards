/**
 * reward.service.js — Gem reward processing for CAPTCHA results.
 *
 * ─── Half-Gem unit system ─────────────────────────────────────────────────────
 * All monetary values are stored as INTEGERS representing half-Gem units:
 *   0 units = 0.0 Gems
 *   1 unit  = 0.5 Gems  (WRONG reward)
 *   2 units = 1.0 Gems  (CORRECT reward)
 *
 * This eliminates all JavaScript floating-point accumulation problems.
 * API responses display Gems (units ÷ 2). Internal DB always holds integers.
 *
 * ─── Atomic strategy ─────────────────────────────────────────────────────────
 * processCaptchaReward uses a MongoDB session transaction:
 *
 *   BEGIN SESSION TRANSACTION
 *     1. Read active reward config
 *     2. Determine reward amount (server-side, from result param)
 *     3. Find-or-create user wallet
 *     4. Read current balance (balanceBefore)
 *     5. Atomically increment wallet balance ($inc)
 *     6. Create GemTransaction with unique referenceId = challengeId
 *   COMMIT  (or ROLLBACK on any error)
 *
 * ─── Duplicate reward protection ─────────────────────────────────────────────
 * GemTransaction.referenceId has a unique index.
 * If the same challengeId is submitted twice (concurrent or sequential),
 * the second GemTransaction.create() throws a duplicate-key error (code 11000).
 * The transaction is rolled back and a 409 error is returned.
 * The wallet is never double-credited.
 *
 * ─── Security guarantees ─────────────────────────────────────────────────────
 * - userId always comes from the verified JWT (req.user.id) — never client body.
 * - reward amount is determined from the server-side `result` string — never client.
 * - isCorrect, reward, amount, balance are never accepted from the client.
 * - Negative wallet balance is impossible (schema min:0 + integer $inc only).
 */

const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const GemTransaction = require('../models/GemTransaction');
const CaptchaRewardConfig = require('../models/CaptchaRewardConfig');

// ─── Safe defaults (used if no config document exists yet) ────────────────────
const DEFAULT_CORRECT_REWARD = 2; // 1.0 Gem in half-Gem units
const DEFAULT_WRONG_REWARD = 1;   // 0.5 Gem in half-Gem units
const CURRENCY = 'GEM';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * getRewardConfig
 * Returns the active reward config from the DB.
 * Falls back to safe hardcoded defaults if no active config exists.
 * Accepts an optional mongoose session for transactional reads.
 */
const getRewardConfig = async (session = null) => {
  const opts = session ? { session } : {};
  const config = await CaptchaRewardConfig.findOne({ isActive: true }, null, opts);

  if (!config) {
    console.warn('[Reward] No active CaptchaRewardConfig found — using hardcoded defaults');
    return {
      correctReward: DEFAULT_CORRECT_REWARD,
      wrongReward: DEFAULT_WRONG_REWARD,
      currency: CURRENCY,
    };
  }

  return {
    correctReward: config.correctReward,
    wrongReward: config.wrongReward,
    currency: config.currency,
  };
};

/**
 * ensureWallet
 * Finds or creates the wallet for a given userId.
 * Uses findOneAndUpdate with upsert so concurrent calls are safe.
 * Accepts an optional mongoose session.
 */
const ensureWallet = async (userId, session = null) => {
  const opts = { upsert: true, new: true, setDefaultsOnInsert: true };
  if (session) opts.session = session;

  return Wallet.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, gemBalance: 0 } },
    opts
  );
};

// ─── Public service functions ─────────────────────────────────────────────────

/**
 * processCaptchaReward
 *
 * Awards Gems for a completed CAPTCHA challenge.
 * Runs inside a MongoDB session transaction to guarantee atomicity.
 *
 * @param {object} params
 * @param {string} params.userId      — from req.user.id (JWT-verified)
 * @param {string} params.challengeId — the verified challenge's ID
 * @param {string} params.result      — 'CORRECT' | 'WRONG' (from server verification)
 *
 * @returns {{ result, rewardUnits, currency, balanceBefore, balanceAfter }}
 *   All balance values in HALF-GEM units. Controller divides by 2 for display.
 *
 * @throws 409 if the reward for this challenge was already processed
 */
const processCaptchaReward = async ({ userId, challengeId, result }) => {
  // Validate result value — never trust it came from the client unverified
  if (result !== 'CORRECT' && result !== 'WRONG') {
    const err = new Error('Invalid CAPTCHA result');
    err.statusCode = 400;
    throw err;
  }

  // ── Start MongoDB session transaction ────────────────────────────────────────
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // ── Step 1: Load reward config ───────────────────────────────────────────────
    const config = await getRewardConfig(session);
    const rewardUnits = result === 'CORRECT' ? config.correctReward : config.wrongReward;

    // ── Step 2: Find or create the user's wallet (inside transaction) ────────────
    await ensureWallet(userId, session);

    // ── Step 3: Atomically read balanceBefore and increment wallet ───────────────
    //    We use findOneAndUpdate with $inc so the read + write is a single
    //    atomic DB operation. No other request can read the old balance between
    //    our read and our write.
    const walletBefore = await Wallet.findOneAndUpdate(
      { userId },
      { $inc: { gemBalance: rewardUnits } },
      { new: false, session } // `new: false` → returns the document BEFORE update
    );

    const balanceBefore = walletBefore ? walletBefore.gemBalance : 0;
    const balanceAfter = balanceBefore + rewardUnits;

    // ── Step 4: Create the GemTransaction ────────────────────────────────────────
    //    referenceId = challengeId has a UNIQUE index.
    //    If this challengeId was already rewarded, this insert throws E11000
    //    and the transaction is rolled back — wallet increment is undone.
    await GemTransaction.create(
      [
        {
          userId,
          currency: config.currency,
          amount: rewardUnits,       // stored in half-Gem units
          type: 'CAPTCHA_REWARD',
          referenceId: challengeId, // unique — prevents duplicate rewards
          balanceBefore,            // in half-Gem units
          balanceAfter,             // in half-Gem units
          status: 'COMPLETED',
        },
      ],
      { session }
    );

    // ── Step 5: Commit ───────────────────────────────────────────────────────────
    await session.commitTransaction();

    return {
      result,
      rewardUnits,      // half-Gem units — controller converts to display Gems
      currency: config.currency,
      balanceBefore,    // half-Gem units
      balanceAfter,     // half-Gem units
    };
  } catch (err) {
    // ── Rollback on any error ────────────────────────────────────────────────────
    await session.abortTransaction();

    // MongoDB duplicate key error — reward already processed for this challenge
    if (err.code === 11000 && err.keyPattern && err.keyPattern.referenceId) {
      const dupErr = new Error('Reward already processed for this challenge');
      dupErr.statusCode = 409;
      throw dupErr;
    }

    throw err;
  } finally {
    session.endSession();
  }
};

/**
 * getWalletBalance
 *
 * Returns the authenticated user's current Gem balance.
 * Finds or creates the wallet (so new users always get a wallet).
 *
 * @param {string} userId — from req.user.id
 * @returns {{ gemBalance: number, currency: string }}
 *   gemBalance is in half-Gem units — controller converts for display.
 */
const getWalletBalance = async (userId) => {
  const wallet = await ensureWallet(userId);
  return {
    gemBalance: wallet.gemBalance,  // half-Gem units
    currency: CURRENCY,
  };
};

/**
 * getTransactionHistory
 *
 * Returns the authenticated user's GemTransaction history, newest first.
 * Pagination-ready: accepts optional { limit, skip }.
 *
 * @param {string} userId — from req.user.id
 * @param {{ limit?: number, skip?: number }} options
 * @returns {GemTransaction[]}
 */
const getTransactionHistory = async (userId, { limit = 50, skip = 0 } = {}) => {
  const transactions = await GemTransaction.find({ userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean(); // returns plain JS objects; toJSON transform not applied on lean()

  // Manually convert half-Gem units to display Gems for each transaction
  return transactions.map((t) => ({
    transactionId: t.transactionId,
    currency: t.currency,
    amount: t.amount / 2,               // display Gems
    type: t.type,
    referenceId: t.referenceId,
    balanceBefore: t.balanceBefore / 2, // display Gems
    balanceAfter: t.balanceAfter / 2,   // display Gems
    status: t.status,
    createdAt: t.createdAt,
  }));
};

/**
 * ensureDefaultRewardConfig
 *
 * Seeds the default reward configuration if none exists.
 * Called once on server start — safe to call multiple times (idempotent).
 */
const ensureDefaultRewardConfig = async () => {
  const existing = await CaptchaRewardConfig.findOne({ isActive: true });
  if (!existing) {
    await CaptchaRewardConfig.create({
      correctReward: DEFAULT_CORRECT_REWARD, // 2 half-units = 1.0 Gem
      wrongReward: DEFAULT_WRONG_REWARD,     // 1 half-unit  = 0.5 Gem
      currency: CURRENCY,
      isActive: true,
    });
    console.log('[Reward] Default CaptchaRewardConfig created (CORRECT=1 Gem, WRONG=0.5 Gem)');
  }
};

module.exports = {
  processCaptchaReward,
  getWalletBalance,
  getTransactionHistory,
  ensureDefaultRewardConfig,
  // Internal helpers exported for unit tests:
  getRewardConfig,
  ensureWallet,
};
