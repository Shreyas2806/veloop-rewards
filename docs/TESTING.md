# Testing Reference — VELoop Rewards

---

## Test Suites Overview

| Suite | File | Tests | Scope | DB Required |
|---|---|---|---|---|
| Stage 2 | `backend/stage2-tests.js` | 16 | JWT authentication | ✅ Atlas |
| Stage 3 | `backend/stage3-tests.js` | 28 | CAPTCHA generation & verification | ✅ Atlas |
| Stage 4 | `backend/stage4-tests.js` | 38 | Gem rewards & wallet | ✅ Atlas |
| Stage 5 | `backend/stage5-tests.js` | 38 | Claim + No Thanks flow | ✅ Atlas |
| Stage 6 | `backend/stage6-tests.js` | 60 | Security & abuse protection | ✅ Atlas |
| Stage 8 | Integration script | 65 | Full E2E via live API | ✅ Atlas + server |
| **Total** | | **245** | | |

---

## Running the Tests

### Prerequisites
- `cd backend && npm install`
- `backend/.env` configured with a valid `MONGO_URI` and `JWT_SECRET`
- MongoDB Atlas accessible from your machine

### Stage 2–6 (unit/integration — 180 tests)

```bash
cd backend

node stage2-tests.js    # 16 tests
node stage3-tests.js    # 28 tests
node stage4-tests.js    # 38 tests
node stage5-tests.js    # 38 tests
node stage6-tests.js    # 60 tests
```

Each script prints a summary line like:
```
  Passed: 38   Failed: 0   Total: 38
```

### All 180 at once

```bash
cd backend
node stage2-tests.js && node stage3-tests.js && node stage4-tests.js && node stage5-tests.js && node stage6-tests.js
```

### Stage 8 live integration (65 tests)

Start the backend first, then run the integration test script:

```bash
cd backend
npm run dev          # keep running in one terminal

# In a second terminal — run the PowerShell integration script
# (see the full script in the Stage 8 integration test file)
```

---

## Test Results

### Regression (180/180)

```
Stage 2 — JWT Authentication       16 / 16  ✅
Stage 3 — CAPTCHA                  28 / 28  ✅
Stage 4 — Rewards + Wallet         38 / 38  ✅
Stage 5 — Claim + No Thanks        38 / 38  ✅
Stage 6 — Security + Abuse         60 / 60  ✅
──────────────────────────────────────────
Total                              180 / 180 ✅
```

### Live Integration (65/65)

```
Auth                               12 / 12  ✅
CAPTCHA                            18 / 18  ✅
Wallet                             10 / 10  ✅
Claim                               6 /  6  ✅
No Thanks                           7 /  7  ✅
User Isolation                      7 /  7  ✅
Error Handling                      5 /  5  ✅
──────────────────────────────────────────
Total                              65 / 65  ✅
```

---

## What Each Stage Tests

### Stage 2 — JWT Authentication (16 tests)
- Register with valid data → 201
- Register with duplicate email → 409
- Register with missing/invalid fields → 422
- Login with correct credentials → 200 + token
- Login with wrong password → 401
- Login with missing fields → 422
- `GET /auth/me` with valid token → 200
- `GET /auth/me` with no token → 401
- `GET /auth/me` with invalid/expired token → 401
- Password never returned in any response

### Stage 3 — CAPTCHA Generation & Verification (28 tests)
- `GET /captcha/current` returns valid challenge
- Challenge has exactly 4 options
- `captchaText` is exactly 6 characters
- `correctOption` is NOT in the response
- `status` is NOT in the safe response
- Reusing same `challengeId` returns same challenge (idempotent GET)
- Expired challenge → new one auto-created
- `POST /captcha/verify` with valid option → 200
- `result` is `CORRECT` or `WRONG`
- `correctOption` NOT in verify response
- Verify with option not in `options[]` → 400
- Verify with missing fields → 422
- Verify with spoofed `isCorrect`/`reward`/`userId` → 422
- Replay verify (same challenge again) → 409
- Verify expired challenge → 410
- Verify another user's challenge → 403
- Unauthenticated access → 401

### Stage 4 — Gem Rewards & Wallet (38 tests)
- Correct answer → reward 1.0 GEM
- Wrong answer → reward 0.5 GEM
- Wallet balance updates after verify
- `GET /wallet/gems` returns numeric balance
- Balance in half-Gem integer units → displayed as decimal
- `GET /wallet/transactions` returns array
- Transaction has `amount`, `type`, `currency`, `balanceBefore`, `balanceAfter`
- Amounts displayed as Gems (halved from internal units)
- `GemTransaction.referenceId` unique — prevents duplicate reward
- Wallet unauthenticated → 401
- Reward config seeded on startup

### Stage 5 — Claim + No Thanks (38 tests)
- `POST /captcha/claim` with valid `challengeId` → 200
- `claimStatus` transitions `PENDING` → `CLAIMED`
- `claimedAt` set on successful claim
- Wallet NOT modified by claim (reward was on verify)
- Duplicate claim → 409
- Claim ACTIVE challenge → 409
- Claim EXPIRED challenge → 409
- Claim INVALIDATED challenge → 409
- Spoofed `claimStatus` field → 422
- `POST /captcha/new` with `previousChallengeId` → invalidates old, returns new
- New challenge has different `challengeId`
- Old INVALIDATED challenge cannot be claimed → 409
- `POST /captcha/new` without `previousChallengeId` → 200 (IDLE flow)
- Earned Gems not deducted on No Thanks

### Stage 6 — Security & Abuse Protection (60 tests)
- Rate limit exceeded → 429
- Concurrent verify attempts (race condition) — only one wins
- Concurrent claim attempts — only one wins
- Replay attacks → 409
- Cross-user verify (User B → User A's challenge) → 403
- Cross-user claim → 403/409
- Spoofed body fields → 422
- Invalid JWT signature → 401
- Expired JWT → 401
- Unknown route → 404
- Oversized body → 413
- CORS preflight from allowed origin → 200/204
- CORS from unknown origin → blocked
- Helmet headers present on responses
- Body-size limit enforced

---

## Security & Negative Tests

| Test | Expected | Reason |
|---|---|---|
| Send `isCorrect: true` in verify body | 422 | Field is server-computed only |
| Send `reward: 9999` in verify body | 422 | Field is server-computed only |
| Send `userId: "evil"` in body | 422 | userId always from JWT |
| Send `claimStatus: "CLAIMED"` in claim body | 422 | Field is server-controlled |
| Verify same `challengeId` twice | 409 | Replay protection |
| Claim same `challengeId` twice | 409 | Duplicate claim protection |
| Use User B's token on User A's challengeId | 403 or 409 | Ownership check |
| Send no `Authorization` header | 401 | JWT required |
| Send expired JWT | 401 | Token expiry enforced |
| Submit option not in challenge's `options[]` | 400 | Option must be in the 4-option set |
| Verify challenge after `expiresAt` | 410 | Time-based expiry |
| Request > 10 KB body | 413 | Body-size limit |

---

## Concurrent Verification Test

Two identical verify requests are sent simultaneously for the same challenge. Verified behaviour:
- One request receives 200 (winner)
- The other receives 409 (loser — `findOneAndUpdate` returns null)
- The wallet is only incremented once
- Only one `GemTransaction` record is created (unique `referenceId` index blocks the second)

---

## User Isolation Test

A second user (User B) attempts to:
1. Verify User A's challenge → `403 Forbidden` (ownership check: `userId !== req.user.id`)
2. Claim User A's challenge → `403 Forbidden` or `409` (already claimed)
3. Read User A's wallet → returns User B's own wallet (query scoped to `req.user.id`)
4. Read User A's transactions → returns User B's own empty list

User B's actions produce **zero effect** on User A's balance or challenge state.

---

## Duplicate Claim Test

1. User A verifies a challenge → reward applied, `claimStatus: PENDING`
2. User A claims → `claimStatus: CLAIMED`
3. User A claims again → **409 Conflict** ("Reward already claimed")
4. User A's wallet balance is identical after step 2 and step 3 (no change)

Two concurrent claim requests:
- One wins the `findOneAndUpdate` with `{ claimStatus: 'PENDING' }` filter
- The second finds no matching document → 409
- Wallet modified exactly once

---

## Frontend Build Verification

```bash
cd frontend
npm run build
```

Expected output:
```
vite v8.3.1  building for production
✓ 1980 modules transformed
dist/index.html           0.58 kB  │ gzip:   0.36 kB
dist/assets/index.css    16.77 kB  │ gzip:   3.98 kB
dist/assets/index.js    338.04 kB  │ gzip: 108.43 kB
✓ built in ~830ms
```

0 errors, 0 warnings.
