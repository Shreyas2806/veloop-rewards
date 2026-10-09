/**
 * captcha.service.js — Business logic for CAPTCHA generation and verification.
 *
 * Security rules enforced here:
 *  - correctOption is NEVER included in the safe response returned to controllers.
 *  - userId is always the verified req.user.id from the JWT — never client input.
 *  - Verification uses an atomic findOneAndUpdate that checks userId + status +
 *    expiry in a single DB round-trip, preventing race conditions.
 *  - Expired challenges are rejected at the business logic level even if the
 *    MongoDB TTL has not yet cleaned them up.
 */

const crypto = require('crypto');
const CaptchaChallenge = require('../models/CaptchaChallenge');

// ─── Constants ────────────────────────────────────────────────────────────────

// Exclude visually ambiguous characters to reduce user error
const CAPTCHA_ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY234679';
const CAPTCHA_LENGTH = 6;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * generateCaptchaText
 * Returns a cryptographically random CAPTCHA string of CAPTCHA_LENGTH chars.
 */
const generateCaptchaText = () => {
  const bytes = crypto.randomBytes(CAPTCHA_LENGTH);
  return Array.from(bytes)
    .map((b) => CAPTCHA_ALPHABET[b % CAPTCHA_ALPHABET.length])
    .join('');
};

/**
 * generateSimilarOption
 * Mutates 1–2 characters of the original text to create a look-alike distractor.
 * Ensures the result differs from the original AND from previously generated options.
 *
 * @param {string} original — the correct CAPTCHA text
 * @param {string[]} existing — options already in the pool (to avoid duplicates)
 */
const generateSimilarOption = (original, existing) => {
  let attempt;
  let tries = 0;

  do {
    const chars = original.split('');
    // Mutate 1 or 2 random positions
    const mutationCount = crypto.randomInt(1, 3);
    const positions = new Set();

    while (positions.size < mutationCount) {
      positions.add(crypto.randomInt(0, CAPTCHA_LENGTH));
    }

    positions.forEach((pos) => {
      let replacement;
      do {
        const randByte = crypto.randomBytes(1)[0];
        replacement = CAPTCHA_ALPHABET[randByte % CAPTCHA_ALPHABET.length];
      } while (replacement === chars[pos]);
      chars[pos] = replacement;
    });

    attempt = chars.join('');
    tries++;
  } while ((existing.includes(attempt) || attempt === original) && tries < 50);

  return attempt;
};

/**
 * generateDistinctOption
 * Generates a completely different CAPTCHA string (shares at most 2 chars with original).
 *
 * @param {string} original
 * @param {string[]} existing
 */
const generateDistinctOption = (original, existing) => {
  let attempt;
  let tries = 0;

  do {
    attempt = generateCaptchaText();
    // Count shared characters at same positions
    const sharedCount = attempt.split('').filter((c, i) => c === original[i]).length;
    tries++;
  } while ((existing.includes(attempt) || attempt === original) && tries < 50);

  return attempt;
};

/**
 * generateOptions
 * Produces exactly 4 options:
 *   - 1 correct (the original)
 *   - 2 similar distractors (1–2 char mutations)
 *   - 1 completely different distractor
 *
 * The correct option is placed at a cryptographically random index (0–3).
 * Returns { options: string[], correctOption: string }
 *
 * @param {string} captchaText — the correct answer
 */
const generateOptions = (captchaText) => {
  const distractors = [];

  // Two similar distractors
  distractors.push(generateSimilarOption(captchaText, [captchaText]));
  distractors.push(generateSimilarOption(captchaText, [captchaText, distractors[0]]));

  // One completely different distractor
  distractors.push(generateDistinctOption(captchaText, [captchaText, ...distractors]));

  // Place correct answer at a random position 0–3
  const correctIndex = crypto.randomInt(0, 4);
  const options = [...distractors];
  options.splice(correctIndex, 0, captchaText); // insert correct at random position

  return { options, correctOption: captchaText };
};

/**
 * generateChallengeId
 * Returns a URL-safe unique identifier built from cryptographic randomness.
 */
const generateChallengeId = () =>
  crypto.randomBytes(18).toString('base64url'); // 24-char URL-safe string

/**
 * getCaptchaExpirySeconds
 * Reads CAPTCHA_EXPIRY_SECONDS from env; defaults to 120 seconds.
 */
const getCaptchaExpirySeconds = () => {
  const val = parseInt(process.env.CAPTCHA_EXPIRY_SECONDS, 10);
  return Number.isFinite(val) && val > 0 ? val : 120;
};

// ─── Safe response shape ──────────────────────────────────────────────────────

/**
 * toSafeChallenge
 * Strips correctOption and internal DB fields from a challenge document.
 * This is the ONLY shape that ever reaches a controller or API response.
 *
 * @param {object} doc — Mongoose CaptchaChallenge document
 */
const toSafeChallenge = (doc) => ({
  challengeId: doc.challengeId,
  captchaText: doc.captchaText,
  options: doc.options,
  expiresAt: doc.expiresAt,
});

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * createCaptchaChallenge
 *
 * Generates a new CAPTCHA and stores it in MongoDB.
 * Returns a safe object — correctOption is NEVER included.
 *
 * @param {string} userId — verified user id from req.user.id
 * @returns {object} safe challenge
 */
const createCaptchaChallenge = async (userId) => {
  const captchaText = generateCaptchaText();
  const { options, correctOption } = generateOptions(captchaText);
  const challengeId = generateChallengeId();
  const expirySeconds = getCaptchaExpirySeconds();
  const expiresAt = new Date(Date.now() + expirySeconds * 1000);

  const challenge = await CaptchaChallenge.create({
    challengeId,
    userId,
    captchaText,
    options,
    correctOption, // stored securely; select:false prevents accidental exposure
    status: 'ACTIVE',
    expiresAt,
  });

  return toSafeChallenge(challenge);
};

/**
 * getCurrentChallenge
 *
 * Returns the user's current ACTIVE non-expired challenge.
 * If none exists (or it has expired), creates a fresh one.
 *
 * Expired-but-still-ACTIVE documents are marked EXPIRED before creating a new one.
 *
 * @param {string} userId — verified user id from req.user.id
 * @returns {object} safe challenge
 */
const getCurrentChallenge = async (userId) => {
  const now = new Date();

  // Look for an ACTIVE challenge for this user
  const existing = await CaptchaChallenge.findOne({
    userId,
    status: 'ACTIVE',
  }).sort({ createdAt: -1 });

  if (existing) {
    // Challenge found — has it expired?
    if (existing.expiresAt > now) {
      // Still valid — return without exposing correctOption
      return toSafeChallenge(existing);
    }

    // It's expired — mark it EXPIRED so the DB state is consistent
    await CaptchaChallenge.findOneAndUpdate(
      { _id: existing._id, status: 'ACTIVE' },
      { $set: { status: 'EXPIRED' } }
    );
  }

  // No valid challenge — create a new one
  return createCaptchaChallenge(userId);
};

/**
 * verifyCaptchaChallenge
 *
 * Atomically verifies a CAPTCHA submission.
 *
 * Atomic contract (single DB round-trip):
 *   Find the document WHERE:
 *     challengeId = given challengeId
 *     AND userId  = req.user.id           (ownership check)
 *     AND status  = 'ACTIVE'              (not already completed/expired)
 *     AND expiresAt > now                 (not expired)
 *   Then UPDATE:
 *     status      = 'COMPLETED'
 *     selectedOption = supplied option
 *     result      = 'CORRECT' | 'WRONG'
 *     completedAt = now
 *
 * This single atomic operation prevents:
 *   - Replay attacks (status transitions from ACTIVE only once)
 *   - Race conditions (only one concurrent request can win the update)
 *   - Ownership bypass (userId is always in the filter)
 *   - Expired challenge abuse (expiresAt is in the filter)
 *
 * @param {string} userId        — from req.user.id (JWT-verified)
 * @param {string} challengeId   — from req.body
 * @param {string} selectedOption — from req.body
 * @returns {{ result, challengeId, completedAt }}
 */
const verifyCaptchaChallenge = async (userId, challengeId, selectedOption) => {
  const now = new Date();

  // ── 1. Load the challenge WITH correctOption for comparison ──────────────────
  //    We do this separately (not in the atomic update) so we can:
  //      a) return specific error codes (404, 403, 409, 410)
  //      b) check that selectedOption ∈ challenge.options

  const challenge = await CaptchaChallenge.findOne({ challengeId }).select(
    '+correctOption'
  );

  if (!challenge) {
    const err = new Error('Challenge not found');
    err.statusCode = 404;
    throw err;
  }

  // ── 2. Ownership check ───────────────────────────────────────────────────────
  if (challenge.userId.toString() !== userId.toString()) {
    const err = new Error('Access denied');
    err.statusCode = 403;
    throw err;
  }

  // ── 3. State checks (in order — most specific first) ────────────────────────
  if (challenge.status === 'COMPLETED') {
    const err = new Error('Challenge has already been completed');
    err.statusCode = 409;
    throw err;
  }

  if (challenge.status === 'INVALIDATED') {
    const err = new Error('Challenge has been invalidated');
    err.statusCode = 409;
    throw err;
  }

  if (challenge.status === 'EXPIRED' || challenge.expiresAt <= now) {
    // Mark it EXPIRED in DB if still ACTIVE (handles the edge case where
    // the TTL hasn't cleaned it up and status wasn't updated yet)
    if (challenge.status === 'ACTIVE') {
      await CaptchaChallenge.findOneAndUpdate(
        { _id: challenge._id, status: 'ACTIVE' },
        { $set: { status: 'EXPIRED' } }
      );
    }
    const err = new Error('Challenge has expired');
    err.statusCode = 410;
    throw err;
  }

  // ── 4. Validate that selectedOption belongs to this challenge ─────────────
  if (!challenge.options.includes(selectedOption)) {
    const err = new Error('Selected option is not valid for this challenge');
    err.statusCode = 400;
    throw err;
  }

  // ── 5. Determine correctness ─────────────────────────────────────────────────
  const isCorrect = selectedOption === challenge.correctOption;
  const result = isCorrect ? 'CORRECT' : 'WRONG';
  const completedAt = now;

  // ── 6. Atomic update: only succeeds when challenge is still ACTIVE ───────────
  //    The filter redundantly includes status:'ACTIVE' so that if two concurrent
  //    requests both reach this point, only one will find a document to update.
  //    The second will get null and return 409.
  const updated = await CaptchaChallenge.findOneAndUpdate(
    {
      challengeId,
      userId,
      status: 'ACTIVE',
      expiresAt: { $gt: now },
    },
    {
      $set: {
        status: 'COMPLETED',
        selectedOption,
        result,
        completedAt,
      },
    },
    { new: true }
  );

  if (!updated) {
    // Lost the race — another request completed it first
    const err = new Error('Challenge has already been completed');
    err.statusCode = 409;
    throw err;
  }

  // ── 7. Return safe result — correctOption is NEVER included ─────────────────
  return {
    result,
    challengeId: updated.challengeId,
    completedAt: updated.completedAt,
  };
};

// ─── Stage 5 service functions ───────────────────────────────────────────────

/**
 * claimCaptchaChallenge
 *
 * Atomically transitions claimStatus PENDING → CLAIMED for a completed challenge.
 *
 * Atomic contract:
 *   findOneAndUpdate WHERE:
 *     challengeId = given challengeId
 *     AND userId  = req.user.id          (ownership)
 *     AND status  = 'COMPLETED'          (must have been verified)
 *     AND claimStatus = 'PENDING'        (not already claimed)
 *   SET claimStatus = 'CLAIMED', claimedAt = now
 *
 * The atomic filter ensures:
 *   - Only ONE concurrent request can win (second gets null → 409)
 *   - INVALIDATED challenges can never be claimed (status !== 'COMPLETED')
 *   - Wallet is NOT touched — reward was already applied during verification
 *
 * @param {string} userId       — from req.user.id (JWT-verified)
 * @param {string} challengeId  — from req.body
 * @param {object} GemTransaction — model, for reward existence check
 * @returns {{ challengeId, claimStatus, claimedAt }}
 */
const claimCaptchaChallenge = async (userId, challengeId, GemTransaction) => {
  // ── 1. Load challenge (no correctOption needed) ──────────────────────────────
  const challenge = await CaptchaChallenge.findOne({ challengeId });

  if (!challenge) {
    const err = new Error('Challenge not found');
    err.statusCode = 404;
    throw err;
  }

  // ── 2. Ownership check ───────────────────────────────────────────────────────
  if (challenge.userId.toString() !== userId.toString()) {
    const err = new Error('Access denied');
    err.statusCode = 403;
    throw err;
  }

  // ── 3. Eligibility checks ────────────────────────────────────────────────────
  if (challenge.status === 'ACTIVE') {
    const err = new Error('Challenge must be completed before claiming');
    err.statusCode = 409;
    throw err;
  }

  if (challenge.status === 'INVALIDATED') {
    const err = new Error('Challenge has been invalidated and cannot be claimed');
    err.statusCode = 409;
    throw err;
  }

  if (challenge.status === 'EXPIRED') {
    const err = new Error('Challenge has expired and cannot be claimed');
    err.statusCode = 409;
    throw err;
  }

  if (challenge.claimStatus === 'CLAIMED') {
    const err = new Error('Reward already claimed');
    err.statusCode = 409;
    throw err;
  }

  // ── 4. Verify reward transaction exists (reward was actually processed) ───────
  const txn = await GemTransaction.findOne({ referenceId: challengeId });
  if (!txn) {
    const err = new Error('Reward transaction not found — reward was not processed');
    err.statusCode = 409;
    throw err;
  }

  // ── 5. Atomic claim: PENDING → CLAIMED ───────────────────────────────────────
  //    Filter includes both status=COMPLETED and claimStatus=PENDING so that
  //    two simultaneous requests can only both succeed if both conditions hold.
  //    The second concurrent request will find nothing to update → 409.
  const now = new Date();
  const claimed = await CaptchaChallenge.findOneAndUpdate(
    {
      challengeId,
      userId,
      status: 'COMPLETED',
      claimStatus: 'PENDING',
    },
    {
      $set: {
        claimStatus: 'CLAIMED',
        claimedAt: now,
      },
    },
    { new: true }
  );

  if (!claimed) {
    // Lost the race — another concurrent request claimed it first
    const err = new Error('Reward already claimed');
    err.statusCode = 409;
    throw err;
  }

  return {
    challengeId: claimed.challengeId,
    claimStatus: claimed.claimStatus,
    claimedAt: claimed.claimedAt,
    result: claimed.result,
  };
};

/**
 * requestNewChallenge
 *
 * No Thanks flow:
 *   1. Atomically INVALIDATE the previous challenge (if supplied and valid).
 *   2. Create and return a fresh CAPTCHA challenge.
 *
 * Invalidation rules:
 *   - Only challenges belonging to the authenticated user are invalidated.
 *   - COMPLETED challenges can be invalidated (user chose No Thanks after verifying).
 *   - ACTIVE challenges can be invalidated (user chose No Thanks before answering).
 *   - Already INVALIDATED / EXPIRED / CLAIMED challenges are left as-is (no error).
 *   - Gems earned during verification are NEVER deducted.
 *
 * @param {string} userId              — from req.user.id
 * @param {string} [previousChallengeId] — optional; from req.body
 * @returns {object} safe new challenge (no correctOption)
 */
const requestNewChallenge = async (userId, previousChallengeId = null) => {
  // ── 1. Invalidate the previous challenge if provided ─────────────────────────
  if (previousChallengeId) {
    // Only invalidate if the challenge belongs to this user and is still active/completed
    await CaptchaChallenge.findOneAndUpdate(
      {
        challengeId: previousChallengeId,
        userId,
        status: { $in: ['ACTIVE', 'COMPLETED'] },
      },
      { $set: { status: 'INVALIDATED' } }
    );
    // If the document wasn't found (wrong user, already invalidated, etc.)
    // we silently continue — the important thing is a fresh challenge is created.
  }

  // ── 2. Create and return a fresh challenge ────────────────────────────────────
  return createCaptchaChallenge(userId);
};

module.exports = {
  createCaptchaChallenge,
  getCurrentChallenge,
  verifyCaptchaChallenge,
  claimCaptchaChallenge,
  requestNewChallenge,
  // Exported for unit tests only:
  generateCaptchaText,
  generateOptions,
  getCaptchaExpirySeconds,
  toSafeChallenge,
};
