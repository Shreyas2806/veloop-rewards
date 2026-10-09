# API Reference — VELoop Rewards

Base URL (development): `http://localhost:5000/api`

All protected endpoints require the header:
```
Authorization: Bearer <JWT token>
```

All responses follow the shape:
```json
{ "success": true|false, "data": { ... } }
{ "success": false, "message": "Error description", "errors": [...] }
```

---

## Authentication

### POST `/auth/register`

Register a new user.

**Authentication:** None

**Request body:**
```json
{
  "name": "Shreyas RK",
  "email": "shreyas@example.com",
  "password": "MySecret123!"
}
```

| Field | Type | Rules |
|---|---|---|
| `name` | string | Required, max 100 chars |
| `email` | string | Required, valid email, unique |
| `password` | string | Required, min 8 chars |

**Success — 201 Created:**
```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": {
      "id": "60d21b4667d0d8992e610c85",
      "name": "Shreyas RK",
      "email": "shreyas@example.com",
      "createdAt": "2026-09-30T07:00:00.000Z"
    }
  }
}
```

> Password is **never** returned in any response.

**Errors:**

| Code | Condition |
|---|---|
| 409 | Email already registered |
| 422 | Validation failure (missing field, invalid email, short password) |

---

### POST `/auth/login`

Login with email and password. Returns a JWT.

**Authentication:** None

**Request body:**
```json
{
  "email": "shreyas@example.com",
  "password": "MySecret123!"
}
```

**Success — 200 OK:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGci...",
    "user": {
      "id": "60d21b4667d0d8992e610c85",
      "name": "Shreyas RK",
      "email": "shreyas@example.com"
    }
  }
}
```

**Errors:**

| Code | Condition |
|---|---|
| 401 | Email not found or password incorrect |
| 422 | Missing email or password |

---

### GET `/auth/me`

Return the currently authenticated user's profile.

**Authentication:** Required

**Success — 200 OK:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "60d21b4667d0d8992e610c85",
      "name": "Shreyas RK",
      "email": "shreyas@example.com",
      "createdAt": "2026-09-30T07:00:00.000Z"
    }
  }
}
```

**Errors:**

| Code | Condition |
|---|---|
| 401 | No token, invalid token, or expired token |

---

## CAPTCHA

### GET `/captcha/current`

Get the authenticated user's active CAPTCHA challenge. If none exists or the previous one has expired, a new one is created automatically.

**Authentication:** Required

**Success — 200 OK:**
```json
{
  "success": true,
  "data": {
    "challenge": {
      "challengeId": "a1b2c3d4e5f6g7h8i9j0k1l2",
      "captchaText": "A4KFJM",
      "options": ["A4KFJM", "A4KFJN", "B4KFJM", "XRQPZL"],
      "expiresAt": "2026-09-30T07:02:00.000Z"
    }
  }
}
```

> `correctOption` is **never** included in this response. The correct answer is one of the four `options` — the backend knows which one; the client does not.

**Errors:**

| Code | Condition |
|---|---|
| 401 | Unauthenticated |
| 429 | Rate limit exceeded |

---

### POST `/captcha/verify`

Submit an answer for the active CAPTCHA. The backend determines correctness, calculates the reward, and atomically updates the wallet.

**Authentication:** Required

**Request body:**
```json
{
  "challengeId": "a1b2c3d4e5f6g7h8i9j0k1l2",
  "selectedOption": "A4KFJM"
}
```

> Do **not** send `userId`, `isCorrect`, `reward`, or `claimStatus` — these are rejected with 422.

**Success — 200 OK:**
```json
{
  "success": true,
  "data": {
    "result": "CORRECT",
    "reward": {
      "amount": 1.0,
      "currency": "GEM"
    },
    "challenge": {
      "challengeId": "a1b2c3d4e5f6g7h8i9j0k1l2",
      "completedAt": "2026-09-30T07:01:15.000Z"
    }
  }
}
```

| `result` | `reward.amount` | Meaning |
|---|---|---|
| `"CORRECT"` | `1.0` | Correct answer |
| `"WRONG"` | `0.5` | Wrong answer (partial reward) |

**Errors:**

| Code | Condition |
|---|---|
| 400 | `selectedOption` is not one of the 4 valid options |
| 401 | Unauthenticated |
| 403 | Challenge belongs to a different user |
| 409 | Challenge already completed or invalidated |
| 410 | Challenge has expired |
| 422 | Missing `challengeId` or `selectedOption`; or spoofed field detected |
| 429 | Rate limit exceeded |

---

### POST `/captcha/claim`

Acknowledge a completed reward. Transitions `claimStatus` from `PENDING` to `CLAIMED`. The wallet balance is **not** changed — the reward was applied during `verify`.

**Authentication:** Required

**Request body:**
```json
{
  "challengeId": "a1b2c3d4e5f6g7h8i9j0k1l2"
}
```

**Success — 200 OK:**
```json
{
  "success": true,
  "data": {
    "challengeId": "a1b2c3d4e5f6g7h8i9j0k1l2",
    "claimStatus": "CLAIMED",
    "claimedAt": "2026-09-30T07:01:30.000Z",
    "result": "CORRECT"
  }
}
```

**Errors:**

| Code | Condition |
|---|---|
| 401 | Unauthenticated |
| 403 | Challenge belongs to a different user |
| 404 | Challenge not found |
| 409 | Already claimed, or challenge is ACTIVE/EXPIRED/INVALIDATED |
| 422 | Missing `challengeId`; or spoofed field (`claimStatus`, `reward`, `userId`) |
| 429 | Rate limit exceeded |

---

### POST `/captcha/new`

No Thanks flow. Optionally invalidates a previous challenge and returns a brand-new CAPTCHA. Gems already earned are never deducted.

**Authentication:** Required

**Request body:**
```json
{
  "previousChallengeId": "a1b2c3d4e5f6g7h8i9j0k1l2"
}
```

`previousChallengeId` is optional. Omit it when starting from IDLE state.

**Success — 200 OK:**
```json
{
  "success": true,
  "data": {
    "challenge": {
      "challengeId": "z9y8x7w6v5u4t3s2r1q0p9o8",
      "captchaText": "QRXT4N",
      "options": ["QRXT4N", "QRXT5N", "ERXT4N", "JKPWMV"],
      "expiresAt": "2026-09-30T07:03:00.000Z"
    }
  }
}
```

**Errors:**

| Code | Condition |
|---|---|
| 401 | Unauthenticated |
| 422 | Spoofed field in body |
| 429 | Rate limit exceeded |

---

## Wallet

### GET `/wallet/gems`

Return the authenticated user's current Gem balance.

**Authentication:** Required

**Success — 200 OK:**
```json
{
  "success": true,
  "data": {
    "balance": 3.5,
    "currency": "GEM"
  }
}
```

**Errors:**

| Code | Condition |
|---|---|
| 401 | Unauthenticated |

---

### GET `/wallet/transactions`

Return the authenticated user's transaction history, newest first.

**Authentication:** Required

**Query parameters (optional):**

| Param | Default | Description |
|---|---|---|
| `limit` | 50 | Max transactions to return |
| `skip` | 0 | Offset for pagination |

**Success — 200 OK:**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "transactionId": "abc123def456",
        "type": "CAPTCHA_REWARD",
        "amount": 1.0,
        "currency": "GEM",
        "referenceId": "a1b2c3d4e5f6g7h8i9j0k1l2",
        "balanceBefore": 2.5,
        "balanceAfter": 3.5,
        "status": "COMPLETED",
        "createdAt": "2026-09-30T07:01:15.000Z"
      }
    ]
  }
}
```

**Errors:**

| Code | Condition |
|---|---|
| 401 | Unauthenticated |

---

## Common Error Responses

### 401 Unauthorized
```json
{ "success": false, "message": "Authentication required" }
{ "success": false, "message": "Invalid or expired token" }
```

### 422 Validation Error
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "isCorrect", "message": "isCorrect must not be supplied by the client" },
    { "field": "selectedOption", "message": "selectedOption is required" }
  ]
}
```

### 429 Rate Limited
```json
{ "success": false, "message": "Too many requests. Please try again later." }
```

### 404 Not Found
```json
{ "success": false, "message": "Route not found: GET /api/unknown" }
```

---

## Rate Limits (per IP, per 15-minute window)

| Endpoint | Limit |
|---|---|
| All `/api/*` routes | 100 |
| `GET /api/captcha/current` | 60 |
| `POST /api/captcha/verify` | 30 |
| `POST /api/captcha/claim` | 30 |
| `POST /api/captcha/new` | 30 |
