/**
 * CaptchaRewardConfig.js — Backend-controlled CAPTCHA reward configuration.
 *
 * Reward amounts are stored here so they can be changed server-side without
 * a code deployment. The frontend NEVER reads or modifies this collection.
 *
 * Amounts stored in half-Gem integer units:
 *   correctReward = 2  →  1.0 Gem  (CORRECT CAPTCHA)
 *   wrongReward   = 1  →  0.5 Gem  (WRONG CAPTCHA)
 *
 * Only one active config exists at a time (isActive: true).
 * The reward.service always reads the active config; if none exists, it
 * falls back to hardcoded safe defaults and logs a warning.
 */

const mongoose = require('mongoose');

const captchaRewardConfigSchema = new mongoose.Schema(
  {
    // Stored in half-Gem integer units.
    // correctReward = 2 → 1.0 Gem display
    correctReward: {
      type: Number,
      required: true,
      default: 2, // 1.0 Gem
      validate: {
        validator: Number.isInteger,
        message: 'correctReward must be an integer (half-Gem units)',
      },
    },

    // wrongReward = 1 → 0.5 Gem display
    wrongReward: {
      type: Number,
      required: true,
      default: 1, // 0.5 Gem
      validate: {
        validator: Number.isInteger,
        message: 'wrongReward must be an integer (half-Gem units)',
      },
    },

    currency: {
      type: String,
      required: true,
      default: 'GEM',
      enum: ['GEM'],
    },

    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

const CaptchaRewardConfig = mongoose.model('CaptchaRewardConfig', captchaRewardConfigSchema);

module.exports = CaptchaRewardConfig;
