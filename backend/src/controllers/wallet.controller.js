/**
 * wallet.controller.js — Thin controller for wallet routes.
 *
 * Security invariants:
 *   - req.user.id is ALWAYS from the JWT (set by auth.middleware).
 *   - userId is NEVER read from req.body, req.params, or req.query.
 *   - Client cannot specify balance, amount, or any monetary value.
 */

const rewardService = require('../services/reward.service');

// ─── GET /api/wallet/gems ─────────────────────────────────────────────────────

/**
 * getWalletBalance
 *
 * Returns the authenticated user's current Gem balance.
 * Balance comes from MongoDB — not from client state or localStorage.
 */
const getWalletBalance = async (req, res, next) => {
  try {
    const userId = req.user.id; // from JWT — never from body

    const { gemBalance, currency } = await rewardService.getWalletBalance(userId);

    return res.status(200).json({
      success: true,
      data: {
        currency,
        balance: gemBalance / 2, // convert half-Gem units → display Gems
      },
    });
  } catch (err) {
    return next(err);
  }
};

// ─── GET /api/wallet/transactions ─────────────────────────────────────────────

/**
 * getTransactionHistory
 *
 * Returns the authenticated user's GemTransaction history.
 * Only transactions belonging to req.user.id are returned.
 */
const getTransactionHistory = async (req, res, next) => {
  try {
    const userId = req.user.id; // from JWT — never from body

    // Optional pagination via query params; default: newest 50 transactions
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const skip = parseInt(req.query.skip, 10) || 0;

    const transactions = await rewardService.getTransactionHistory(userId, { limit, skip });

    return res.status(200).json({
      success: true,
      data: { transactions },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = { getWalletBalance, getTransactionHistory };
