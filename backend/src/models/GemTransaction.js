/**
 * GemTransaction.js — Mongoose schema for Gem reward transactions.
 *
 * Every wallet balance change MUST have a corresponding GemTransaction record.
 * This is the audit ledger — it allows balance reconstruction at any point.
 *
 * Key design decisions:
 *  - referenceId (= challengeId) has a UNIQUE index so that one challenge
 *    can only ever produce ONE reward transaction. This is the database-level
 *    duplicate reward prevention mechanism.
 *  - amount, balanceBefore, balanceAfter are all stored in half-Gem integer
 *    units — same unit as Wallet.gemBalance.
 *  - The toJSON transform converts all amounts to display Gems (÷ 2).
 *  - transactionId is a cryptographically generated URL-safe string.
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

const gemTransactionSchema = new mongoose.Schema(
  {
    // ── Identity ─────────────────────────────────────────────────────────────────
    transactionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => crypto.randomBytes(16).toString('base64url'),
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // ── Transaction details ───────────────────────────────────────────────────────
    currency: {
      type: String,
      required: true,
      default: 'GEM',
      enum: ['GEM'],
    },

    // Stored in half-Gem integer units. Display = amount / 2.
    amount: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: 'amount must be an integer (half-Gem units)',
      },
    },

    type: {
      type: String,
      required: true,
      enum: ['CAPTCHA_REWARD'],
      default: 'CAPTCHA_REWARD',
    },

    // referenceId = challengeId — unique constraint prevents duplicate rewards
    referenceId: {
      type: String,
      required: true,
      unique: true, // ← primary duplicate-reward protection at DB level
      index: true,
    },

    // Balances stored in half-Gem integer units. Display = value / 2.
    balanceBefore: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: 'balanceBefore must be an integer',
      },
    },

    balanceAfter: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: 'balanceAfter must be an integer',
      },
    },

    status: {
      type: String,
      required: true,
      enum: ['COMPLETED'],
      default: 'COMPLETED',
    },
  },
  {
    timestamps: true, // createdAt + updatedAt
  }
);

// ─── Compound index: all of a user's transactions sorted by creation ──────────
gemTransactionSchema.index({ userId: 1, createdAt: -1 });

/**
 * toJSON transform:
 *  - Convert all half-Gem internal units to display Gems (÷ 2).
 *  - Strip internal Mongoose fields.
 */
gemTransactionSchema.set('toJSON', {
  virtuals: false,
  transform(_doc, ret) {
    ret.amount = ret.amount / 2;               // e.g. 2 units → 1 Gem
    ret.balanceBefore = ret.balanceBefore / 2;
    ret.balanceAfter = ret.balanceAfter / 2;
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

const GemTransaction = mongoose.model('GemTransaction', gemTransactionSchema);

module.exports = GemTransaction;
