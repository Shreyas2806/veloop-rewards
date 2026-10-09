
/**
 * captcha.controller.js — Thin controller for CAPTCHA routes.
 *
 * Each handler:
 *   1. Reads authenticated user from req.user.id (set by auth.middleware).
 *   2. Delegates all logic to captcha.service.js / reward.service.js.
 *   3. Formats and returns the HTTP response.
 *   4. Forwards unexpected errors to the centralized error handler via next().
 *
 * Security invariants:
 *   - req.body.userId is NEVER read or used.
 *   - req.body.isCorrect is NEVER read or used.
 *   - req.body.reward is NEVER read or used.
 *   - req.body.amount is NEVER read or used.
 *   - req.body.claimStatus is NEVER read or used.
 *   - correctOption is NEVER included in any response.
 *   - Reward amount is determined server-side from the verification result.
 *   - Claim state is determined server-side — client cannot force CLAIMED.
 */

const captchaService = require('../services/captcha.service');
const rewardService = require('../services/reward.service');
const GemTransaction = require('../models/GemTransaction');

// ─── GET /api/captcha/current ─────────────────────────────────────────────────

/**
 * getCurrentCaptcha
 *
 * Returns the user's current ACTIVE challenge, or creates a fresh one.
 * The service guarantees correctOption is never in the returned object.
 */
const getCurrentCaptcha = async (req, res, next) => {
  try {
    const userId = req.user.id; // from JWT — never from request body
    const challenge = await captchaService.getCurrentChallenge(userId);
    return res.status(200).json({ success: true, data: { challenge } });
  } catch (err) {
    return next(err);
  }
};

// ─── POST /api/captcha/verify ─────────────────────────────────────────────────

/**
 * verifyCaptcha
 *
 * Stage 3 + Stage 4 flow:
 *   1. Verify the CAPTCHA answer server-side (Stage 3 — unchanged).
 *   2. Process the Gem reward atomically (Stage 4 — unchanged).
 *   3. Return result + reward information.
 *
 * The client NEVER determines:
 *   - whether the answer is correct
 *   - reward amount
 *   - wallet balance
 */
const verifyCaptcha = async (req, res, next) => {
  try {
    const userId = req.user.id; // from JWT — immutable

    // Only read challengeId and selectedOption from body.
    const { challengeId, selectedOption } = req.body;

    // ── Stage 3: verify the CAPTCHA answer (atomic, unchanged) ──────────────────
    const verification = await captchaService.verifyCaptchaChallenge(
      userId,
      challengeId,
      selectedOption
    );

    // ── Stage 4: process the Gem reward atomically ───────────────────────────────
    const reward = await rewardService.processCaptchaReward({
      userId,
      challengeId: verification.challengeId,
      result: verification.result,
    });

    // ── Response: include result + reward; NEVER include correctOption ───────────
    return res.status(200).json({
      success: true,
      data: {
        challengeId: verification.challengeId,
        result: verification.result,
        completedAt: verification.completedAt,
        reward: {
          amount: reward.rewardUnits / 2, // convert half-Gem units → display Gems
          currency: reward.currency,
        },
      },
    });
  } catch (err) {
    return next(err);
  }
};

// ─── POST /api/captcha/claim ──────────────────────────────────────────────────

/**
 * claimCaptcha
 *
 * Stage 5 flow — Claim:
 *   1. Validate challengeId from body.
 *   2. Verify ownership and eligibility (service).
 *   3. Atomically transition claimStatus PENDING → CLAIMED.
 *   4. Return claim confirmation.
 *
 * IMPORTANT:
 *   - The wallet is NOT touched here. Reward was already applied in verifyCaptcha.
 *   - claimStatus is NEVER read from the request body.
 *   - userId is NEVER read from the request body.
 */
const claimCaptcha = async (req, res, next) => {
  try {
    const userId = req.user.id; // from JWT — immutable
    const { challengeId } = req.body; // only this is read from body

    const claim = await captchaService.claimCaptchaChallenge(
      userId,
      challengeId,
      GemTransaction // pass model for reward existence check
    );

    return res.status(200).json({
      success: true,
      data: {
        challengeId: claim.challengeId,
        claimStatus: claim.claimStatus,
        claimedAt: claim.claimedAt,
        message: 'Reward claimed successfully',
      },
    });
  } catch (err) {
    return next(err);
  }
};

// ─── POST /api/captcha/new ────────────────────────────────────────────────────

/**
 * newCaptcha
 *
 * Stage 5 flow — No Thanks:
 *   1. Invalidate the previous challenge (if supplied).
 *   2. Create and return a fresh CAPTCHA challenge.
 *
 * IMPORTANT:
 *   - Gems already earned are NOT deducted.
 *   - correctOption is NEVER in the response.
 *   - userId is NEVER read from the request body.
 */
const newCaptcha = async (req, res, next) => {
  try {
    const userId = req.user.id; // from JWT — immutable
    const { previousChallengeId } = req.body; // optional

    const challenge = await captchaService.requestNewChallenge(userId, previousChallengeId || null);

    return res.status(200).json({ success: true, data: { challenge } });
  } catch (err) {
    return next(err);
  }
};

module.exports = { getCurrentCaptcha, verifyCaptcha, claimCaptcha, newCaptcha };
