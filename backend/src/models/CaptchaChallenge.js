/**
 * CaptchaChallenge.js — Mongoose schema for CAPTCHA challenges.
 *
 * Security guarantees:
 *  - correctOption is marked `select: false` so it is NEVER returned
 *    by default in any query. The service must explicitly select it
 *    only when performing server-side verification.
 *  - userId is always taken from the verified JWT — never from the client.
 *  - Status transitions are enforced by atomic findOneAndUpdate filters.
 *
 * Challenge lifecycle (Stage 5):
 *   ACTIVE
 *     ↓ (verify)
 *   COMPLETED  →  claimStatus: PENDING
 *     ↓ (claim)
 *   claimStatus: CLAIMED
 *
 *   ACTIVE / COMPLETED
 *     ↓ (No Thanks)
 *   INVALIDATED  — cannot be verified, rewarded, or claimed
 *
 * Indexes:
 *  - challengeId:  unique lookups on verify/claim
 *  - userId:       find a user's active challenge
 *  - status:       filter ACTIVE challenges
 *  - claimStatus:  filter PENDING claims
 *  - expiresAt:    TTL index for automatic DB cleanup (cosmetic)
 */

const mongoose = require('mongoose');

const captchaChallengeSchema = new mongoose.Schema(
  {
    // ── Identity ────────────────────────────────────────────────────────────────
    challengeId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // ── CAPTCHA content ─────────────────────────────────────────────────────────
    captchaText: {
      type: String,
      required: true,
    },

    options: {
      type: [String],
      required: true,
      validate: {
        validator: (arr) => arr.length === 4,
        message: 'A CAPTCHA challenge must have exactly 4 options',
      },
    },

    // NEVER exposed in API responses — select: false enforces this
    correctOption: {
      type: String,
      required: true,
      select: false,
    },

    // ── Lifecycle ───────────────────────────────────────────────────────────────
    // ACTIVE      — open, awaiting user answer
    // COMPLETED   — user submitted answer; reward processed
    // EXPIRED     — time ran out before user answered
    // INVALIDATED — user chose "No Thanks"; cannot be used again
    status: {
      type: String,
      enum: ['ACTIVE', 'COMPLETED', 'EXPIRED', 'INVALIDATED'],
      default: 'ACTIVE',
      index: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    // ── Result (populated after verification) ───────────────────────────────────
    selectedOption: {
      type: String,
      default: null,
    },

    result: {
      type: String,
      enum: ['CORRECT', 'WRONG', null],
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    // ── Claim state (Stage 5) ────────────────────────────────────────────────────
    // PENDING — reward processed, user has not yet claimed
    // CLAIMED — user explicitly claimed; state is final
    //
    // Only challenges where status=COMPLETED AND claimStatus=PENDING are claimable.
    // INVALIDATED challenges can never transition to CLAIMED.
    claimStatus: {
      type: String,
      enum: ['PENDING', 'CLAIMED'],
      default: 'PENDING',
      index: true,
    },

    claimedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt + updatedAt
  }
);

// ─── Compound index: quickly find a user's active challenge ───────────────────
captchaChallengeSchema.index({ userId: 1, status: 1 });

// ─── Compound index: claim lookup ────────────────────────────────────────────
captchaChallengeSchema.index({ userId: 1, claimStatus: 1 });

// ─── TTL index: MongoDB removes expired documents automatically (cosmetic) ─────
// Business expiry validation MUST NOT rely solely on this TTL.
captchaChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ─── toJSON transform: strip correctOption and internal Mongoose fields ────────
captchaChallengeSchema.set('toJSON', {
  virtuals: false,
  transform(_doc, ret) {
    delete ret.correctOption; // belt-and-suspenders — select:false is the main guard
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

const CaptchaChallenge = mongoose.model('CaptchaChallenge', captchaChallengeSchema);

module.exports = CaptchaChallenge;
