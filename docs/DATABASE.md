# Database Reference — VELoop Rewards

All collections are stored in MongoDB Atlas. Mongoose is the ODM. All timestamps are UTC.

---

## Collections

### 1. `users`

Stores registered user accounts.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Auto-generated primary key |
| `name` | String | Required, max 100 chars |
| `email` | String | Required, unique, lowercased at storage |
| `password` | String | bcrypt hash (12 rounds), `select: false` — never returned by queries |
| `createdAt` | Date | Auto (Mongoose timestamps) |
| `updatedAt` | Date | Auto (Mongoose timestamps) |

**Indexes:**
- `email` — unique index (prevents duplicate registration)

**Security:**
- `password` field has `select: false` — never included in query results unless explicitly requested.
- `toJSON` transform strips `password`, `__v`, and remaps `_id` → `id`.

---

### 2. `wallets`

One wallet per user. Stores the Gem balance in integer **half-Gem units** to avoid floating-point precision errors.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Auto-generated |
| `userId` | ObjectId (ref: User) | Required, unique — one wallet per user |
| `gemBalance` | Number (integer) | `0 = 0 Gems`, `1 = 0.5 Gems`, `2 = 1 Gem`, … |
| `createdAt` | Date | Auto |
| `updatedAt` | Date | Auto |

**Conversion:**  `displayBalance = gemBalance / 2`

**Indexes:**
- `userId` — unique index (one wallet per user, enforced at DB level)

**How balance consistency is maintained:**
- The wallet is only updated through atomic `$inc` operations in `reward.service.js`.
- `findOneAndUpdate` with `{ $inc: { gemBalance: rewardUnits } }` is used — never a read-then-write.
- `GemTransaction.referenceId` has a unique index — so even if two concurrent requests both reach the reward code, only one can insert the transaction; the second gets a duplicate-key error, preventing double rewards.
- `toJSON` transform converts `gemBalance` → `balance` (display units) and hides the raw field.

---

### 3. `captchachallenges`

One document per CAPTCHA challenge issued to a user.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Auto-generated |
| `challengeId` | String | Unique 24-char URL-safe random ID |
| `userId` | ObjectId (ref: User) | Owner — always from JWT, never from body |
| `captchaText` | String | 6-char cryptographically random text |
| `options` | [String] | Exactly 4 options (1 correct + 3 distractors) |
| `correctOption` | String | **`select: false`** — never returned by queries |
| `status` | String enum | `ACTIVE` → `COMPLETED` / `EXPIRED` / `INVALIDATED` |
| `expiresAt` | Date | UTC time challenge expires |
| `selectedOption` | String | Set during verification |
| `result` | String enum | `CORRECT` / `WRONG` / `null` |
| `completedAt` | Date | Set on verification |
| `claimStatus` | String enum | `PENDING` → `CLAIMED` |
| `claimedAt` | Date | Set on claim |
| `createdAt` | Date | Auto |
| `updatedAt` | Date | Auto |

**Challenge lifecycle:**
```
ACTIVE ──(verify)──► COMPLETED  ──(claim)──► claimStatus: CLAIMED
  │                     │
  └──(No Thanks)──►     └──(No Thanks)──► INVALIDATED
         │
         ▼
    INVALIDATED
```

**Indexes:**
- `challengeId` — unique (primary lookup key for verify/claim)
- `userId` — for finding a user's challenges
- `status` — for filtering ACTIVE challenges
- `claimStatus` — for filtering PENDING claims
- `{ userId: 1, status: 1 }` — compound (find user's active challenge)
- `{ userId: 1, claimStatus: 1 }` — compound (find user's pending claims)
- `{ expiresAt: 1 }` with `expireAfterSeconds: 0` — TTL index (MongoDB auto-deletes expired docs)

**Security:**
- `correctOption` has `select: false` AND is deleted in `toJSON` transform (belt-and-suspenders).
- `toSafeChallenge()` in `captcha.service.js` builds the safe response object explicitly.
- All verify/claim operations include `userId` in the MongoDB filter to enforce ownership.
- Status transitions use atomic `findOneAndUpdate` — concurrent requests cannot both win.

---

### 4. `gemtransactions`

Immutable audit ledger. One record per reward event.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Auto-generated |
| `transactionId` | String | Unique 22-char random ID |
| `userId` | ObjectId (ref: User) | Owner |
| `currency` | String | Always `"GEM"` |
| `amount` | Number (integer) | Half-Gem units — `toJSON` divides by 2 |
| `type` | String | Always `"CAPTCHA_REWARD"` |
| `referenceId` | String | `= challengeId` — **unique index** (prevents duplicate rewards) |
| `balanceBefore` | Number (integer) | Half-Gem units before this transaction |
| `balanceAfter` | Number (integer) | Half-Gem units after this transaction |
| `status` | String | Always `"COMPLETED"` |
| `createdAt` | Date | Auto |
| `updatedAt` | Date | Auto |

**Indexes:**
- `transactionId` — unique
- `referenceId` — **unique** (primary duplicate-reward guard at DB level)
- `userId` — for filtering a user's transactions
- `{ userId: 1, createdAt: -1 }` — compound (fetch history sorted newest first)

**toJSON transform** divides `amount`, `balanceBefore`, `balanceAfter` by 2 for display.

---

### 5. `captcharewardconfigs`

Singleton collection. Stores the active reward configuration.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Auto-generated |
| `correctReward` | Number (integer) | Half-Gem units for a correct answer (default: `2` = 1.0 Gem) |
| `wrongReward` | Number (integer) | Half-Gem units for a wrong answer (default: `1` = 0.5 Gem) |
| `currency` | String | Always `"GEM"` |
| `isActive` | Boolean | Only the document where `isActive: true` is used |
| `createdAt` | Date | Auto |
| `updatedAt` | Date | Auto |

**Indexes:**
- `isActive` — for fast lookup of the active config

**Seeding:** `ensureDefaultRewardConfig()` in `reward.service.js` creates the default document on server startup if none exists.

---

## Relationships

```
User (1) ──────────────────── (1) Wallet
  │
  └── (many) CaptchaChallenge
        │
        └── (1) GemTransaction  (via referenceId = challengeId)

CaptchaRewardConfig  ──  singleton, referenced by reward.service.js
```

---

## Wallet and Reward Consistency

The system uses a layered approach to ensure rewards are never doubled or lost:

### Layer 1 — Atomic verify (service level)
`verifyCaptchaChallenge()` uses a single `findOneAndUpdate` with filter:
```js
{ challengeId, userId, status: 'ACTIVE', expiresAt: { $gt: now } }
```
Only one concurrent request can match this filter — the second gets `null` and returns 409.

### Layer 2 — Unique referenceId (database level)
`GemTransaction.referenceId` has a MongoDB unique index equal to `challengeId`. Even if two processes bypass Layer 1, only one can insert the transaction — the second gets a `MongoServerError: E11000 duplicate key`.

### Layer 3 — Atomic balance increment (no read-modify-write)
```js
Wallet.findOneAndUpdate(
  { userId },
  { $inc: { gemBalance: rewardUnits } },
  { upsert: true, new: true }
)
```
`$inc` is atomic at the MongoDB level — there is no race window between reading and writing the balance.

### Layer 4 — Atomic claim (status transition)
`claimCaptchaChallenge()` uses:
```js
{ challengeId, userId, status: 'COMPLETED', claimStatus: 'PENDING' }
```
The filter on `claimStatus: 'PENDING'` ensures only one request can win the `PENDING → CLAIMED` transition.
