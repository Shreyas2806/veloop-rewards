# Security Reference — VELoop Rewards

This document describes every security control in the VELoop Rewards backend.

---

## 1. JWT Authentication

**Implementation:** `src/middleware/auth.middleware.js`

- Every protected route is guarded by the `protect` middleware.
- Applied at **router level** (`router.use(protect)`) — no route can accidentally be left unprotected.
- The middleware extracts the token from `Authorization: Bearer <token>`.
- Uses `jsonwebtoken.verify()` with `process.env.JWT_SECRET`.
- On success: attaches `req.user = { id: payload.userId }`.
- On failure: returns 401 with `{ success: false, message: "..." }` — does not leak whether the user exists.

**Token storage (frontend):** JWT is stored in `localStorage` under the key `veloop_token`. The frontend's `api.js` interceptor attaches it to every request header. No wallet data, balance, or CAPTCHA state is stored client-side.

**Token expiry:** Configurable via `JWT_EXPIRES_IN` env var (default: `1d`). Expired tokens receive 401. The frontend's global 401 interceptor clears the token and redirects to `/login`.

---

## 2. User Isolation

Every database query that touches user-specific data includes `userId` in the filter:

| Operation | Filter includes `userId` |
|---|---|
| Find active CAPTCHA challenge | ✅ `{ userId, status: 'ACTIVE' }` |
| Verify CAPTCHA | ✅ `{ challengeId, userId, status: 'ACTIVE', expiresAt: { $gt: now } }` |
| Claim reward | ✅ `{ challengeId, userId, status: 'COMPLETED', claimStatus: 'PENDING' }` |
| Invalidate old challenge | ✅ `{ challengeId: prev, userId }` |
| Wallet balance read | ✅ `{ userId }` |
| Wallet balance update | ✅ `{ userId }` |
| Transaction history | ✅ `{ userId }` |

`userId` is **always** sourced from `req.user.id` (the verified JWT payload). It is never read from `req.body`, `req.params`, or `req.query`.

---

## 3. Server-Side CAPTCHA Verification

**Implementation:** `src/services/captcha.service.js` → `verifyCaptchaChallenge()`

The backend is the exclusive source of truth for CAPTCHA correctness:

1. `correctOption` is stored with `select: false` in the Mongoose schema — Mongoose does not include it in any query result unless `.select('+correctOption')` is explicitly called.
2. The `toSafeChallenge()` function builds the API-safe object from explicit fields only — `correctOption` is never referenced.
3. The `CaptchaChallenge.toJSON` transform deletes `correctOption` as a belt-and-suspenders guard.
4. The verify controller never returns `correctOption` in its response.

The client receives only `{ result: 'CORRECT' | 'WRONG', reward: { amount, currency } }`.

---

## 4. Server-Side Reward Calculation

**Implementation:** `src/services/reward.service.js`

- Reward amounts are stored in the `captcharewardconfigs` collection, not in code or client state.
- The `reward.service` reads the active config from MongoDB on each verification.
- If no config exists, hardcoded safe defaults apply (`correctReward = 2`, `wrongReward = 1` half-Gem units).
- The frontend receives the reward amount as a read-only display value — it never calculates or influences it.

**Client-side spoofing is rejected at the validator layer:**

Fields that are rejected with 422 if sent by the client:

| Endpoint | Rejected fields |
|---|---|
| `POST /captcha/verify` | `isCorrect`, `reward`, `userId`, `result`, `correctOption` |
| `POST /captcha/claim` | `claimStatus`, `reward`, `userId`, `claimedAt` |
| `POST /captcha/new` | `reward`, `userId`, `isCorrect` |

Implemented via `express-validator` in `src/validators/captcha.validator.js`.

---

## 5. Challenge Expiry

- Every `CaptchaChallenge` has an `expiresAt` timestamp (default: 2 minutes from creation).
- The verify filter includes `expiresAt: { $gt: now }` — expired challenges cannot be submitted.
- If `expiresAt < now` and status is still `ACTIVE`, the document is updated to `EXPIRED` before creating a new challenge.
- A MongoDB TTL index (`{ expiresAt: 1 }, { expireAfterSeconds: 0 }`) automatically deletes old documents from the collection.
- **Business logic does not rely on the TTL index** — the code checks `expiresAt` explicitly.

---

## 6. Replay Attack Protection

**Mechanism:** The `status` field in `CaptchaChallenge` is an append-only state machine.

```
ACTIVE  →  COMPLETED  (one-way, atomic)
```

The verify `findOneAndUpdate` filter is:
```js
{ challengeId, userId, status: 'ACTIVE', expiresAt: { $gt: now } }
```

- Once a challenge is `COMPLETED`, no subsequent verify request can match this filter.
- A second verify attempt returns 409 Conflict.
- Two concurrent verify requests race on this filter — MongoDB guarantees only one wins.

---

## 7. Duplicate Claim Protection

**Two-layer mechanism:**

**Layer 1 (service):** The claim `findOneAndUpdate` filter is:
```js
{ challengeId, userId, status: 'COMPLETED', claimStatus: 'PENDING' }
```
Once `claimStatus` is `CLAIMED`, no future claim request matches.

**Layer 2 (database):** `GemTransaction.referenceId` has a MongoDB unique index equal to `challengeId`. Even if two concurrent reward requests bypass the service-level check, only one can insert the transaction record. The second receives a `MongoServerError: E11000 duplicate key error` and the reward is not applied.

---

## 8. Rate Limiting

**Implementation:** `src/middleware/rateLimiter.middleware.js` + `server.js`

Two layers of rate limiting:

| Layer | Scope | Limit | Config |
|---|---|---|---|
| Global | All `/api/*` routes | 100 req / 15 min / IP | `server.js` |
| Per-endpoint | `GET /captcha/current` | 60 req / 15 min / IP | `CAPTCHA_CURRENT_LIMIT_MAX` |
| Per-endpoint | `POST /captcha/verify` | 30 req / 15 min / IP | `CAPTCHA_VERIFY_LIMIT_MAX` |
| Per-endpoint | `POST /captcha/claim` | 30 req / 15 min / IP | `CAPTCHA_CLAIM_LIMIT_MAX` |
| Per-endpoint | `POST /captcha/new` | 30 req / 15 min / IP | `CAPTCHA_NEW_LIMIT_MAX` |

All limits are configurable via environment variables. Responses follow the standard error shape:
```json
{ "success": false, "message": "Too many requests. Please try again later." }
```

---

## 9. Input Validation

**Implementation:** `src/validators/` — `express-validator` rules applied before every controller.

All request bodies are validated for:
- **Presence:** required fields must exist.
- **Type:** strings must be strings, not objects or arrays.
- **Absence of forbidden fields:** client-computed fields (`isCorrect`, `reward`, `userId`, `claimStatus`) are rejected.
- **Format:** email format, password minimum length, option membership (must be one of the 4 challenge options).

Validation errors return 422 with an `errors` array specifying the exact failing field and message.

---

## 10. CORS

**Implementation:** `server.js`

- `cors` middleware restricts allowed origins to the `FRONTEND_URL` env var (comma-separated).
- No wildcard (`*`) origins in production.
- Allowed methods: `GET, POST, PUT, PATCH, DELETE, OPTIONS`.
- Allowed headers: `Content-Type, Authorization`.
- Requests with no `Origin` (curl, Postman, server-to-server) are allowed.
- CORS errors return an Express error (logged server-side); the browser blocks the response.

**Development setup:** `FRONTEND_URL=http://localhost:3000,http://localhost:5173`

**Production:** Set `FRONTEND_URL` to the exact deployed frontend URL.

---

## 11. Helmet

**Implementation:** `server.js` — `app.use(helmet())`

Helmet sets the following security headers on every response:

| Header | Effect |
|---|---|
| `Content-Security-Policy` | Restricts script/style sources |
| `X-Content-Type-Options: nosniff` | Prevents MIME sniffing |
| `X-Frame-Options: SAMEORIGIN` | Prevents clickjacking |
| `Strict-Transport-Security` | Forces HTTPS (in production) |
| `X-XSS-Protection` | Legacy XSS filter |
| `Referrer-Policy` | Controls referrer exposure |

---

## 12. Body-Size Limit

**Implementation:** `server.js`

```js
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
```

Requests with bodies larger than 10 KB are rejected with 413 — prevents memory exhaustion attacks.

---

## 13. Password Security

**Implementation:** `src/models/User.js`

- Passwords are hashed with **bcrypt** using 12 salt rounds before storage.
- The pre-save hook only re-hashes if the password field has changed.
- `password` field has `select: false` — never included in query results.
- `toJSON` transform additionally deletes `password` from any serialized object.
- Plain-text passwords never appear in logs, responses, or anywhere outside the registration/login request.

---

## 14. Protection Against Spoofed Fields

The validator explicitly **rejects** any request that includes server-computed fields:

```js
// Example from captcha.validator.js
body('isCorrect').not().exists().withMessage('isCorrect must not be supplied by the client'),
body('reward').not().exists().withMessage('reward must not be supplied by the client'),
body('userId').not().exists().withMessage('userId must not be supplied by the client'),
```

This means even if a client sends `{ "isCorrect": true, "reward": 9999 }`, the server returns 422 before the controller is reached.

---

## 15. No Secrets in Logs

- The full MongoDB URI (which contains the password) is never logged.
- On connection failure, only `error.message` is printed — not the URI.
- JWT tokens are not logged.
- Passwords are not logged.

---

## Security Checklist for Production

- [ ] Generate a new `JWT_SECRET` (≥64 random characters): `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- [ ] Set `NODE_ENV=production`
- [ ] Set `FRONTEND_URL` to your exact deployed frontend origin
- [ ] Restrict MongoDB Atlas Network Access to your server IP only
- [ ] Enable HTTPS (TLS) — never run without it
- [ ] Rotate the MongoDB Atlas database user password from the default
- [ ] Review and tighten rate limits for your expected traffic
