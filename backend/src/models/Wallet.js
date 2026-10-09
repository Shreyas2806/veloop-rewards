/**
 * Wallet.js — Mongoose schema for a user's Gem wallet.
 *
 * Design decisions:
 *  - gemBalance is stored as an INTEGER representing half-Gem units.
 *    This eliminates all floating-point precision problems.
 *
 *    Conversion table:
 *      0 units   =  0.0 Gems
 *      1 unit    =  0.5 Gems  (wrong CAPTCHA reward)
 *      2 units   =  1.0 Gems  (correct CAPTCHA reward)
 *      3 units   =  1.5 Gems
 *      ...
 *
 *    Display formula:  displayBalance = gemBalance / 2
 *
 *  - One wallet per user — enforced by a unique index on userId.
 *  - The wallet is always created server-side; the client never writes to it.
 *  - Minimum balance is 0 — enforced by the schema min constraint.
 *  - Wallet is updated only through atomic $inc operations in the service
 *    to prevent race conditions on concurrent reward processing.
 */

const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // one wallet per user — enforced at DB level
      index: true,
    },

    // Stored in half-Gem integer units to avoid floating-point drift.
    // 0 = 0 Gems, 1 = 0.5 Gems, 2 = 1 Gem, etc.
    gemBalance: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Gem balance cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'gemBalance must be an integer (half-Gem units)',
      },
    },
  },
  {
    timestamps: true, // createdAt + updatedAt
  }
);

/**
 * toJSON transform:
 *  - Convert internal half-Gem units to display Gems (÷ 2).
 *  - Strip internal Mongoose fields.
 */
walletSchema.set('toJSON', {
  virtuals: false,
  transform(_doc, ret) {
    ret.balance = ret.gemBalance / 2; // display value
    delete ret.gemBalance;            // hide raw storage unit
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

const Wallet = mongoose.model('Wallet', walletSchema);

module.exports = Wallet;
