# VELoop Rewards — CAPTCHA Earn

A full-stack MERN application where users solve text CAPTCHAs to earn Gems. The backend is the exclusive source of truth for correctness, rewards, and wallet balances.

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Tech Stack](#tech-stack)
5. [Local Setup](#local-setup)
6. [Environment Variables](#environment-variables)
7. [Running Locally](#running-locally)
8. [API Overview](#api-overview)
9. [Testing](#testing)
10. [Security Notes](#security-notes)
11. [Demo Flow](#demo-flow)
12. [Deployment](#deployment)

---

## Overview

VELoop Rewards is a CAPTCHA-earn module built as an internship project. Users register, log in, and are presented with a 6-character text CAPTCHA with four multiple-choice options. After selecting an option and submitting, the backend verifies the answer, awards Gems, and updates the wallet — the frontend never performs any of these calculations.

---

## Features

| Feature | Details |
|---|---|
| User registration + login | JWT-based authentication, bcrypt-hashed passwords |
| CAPTCHA generation | 6-char cryptographically random text, 4 options (1 correct + 3 distractors) |
| Server-side verification | `correctOption` never sent to client; backend determines result |
| Gem wallet | Server-authoritative balance using integer half-Gem units |
| Transaction ledger | Every reward creates a `GemTransaction` audit record |
| Claim flow | User explicitly claims completed rewards (PENDING → CLAIMED) |
| No Thanks flow | User can skip to a fresh challenge; earned Gems are never deducted |
| Security hardening | Rate limiting, CORS, Helmet, body-size limits, replay protection |
| React frontend | Protected routes, auth context, per-state CAPTCHA UI |

---

## Architecture

```
┌─────────────────────────────────────────┐
│           React + Vite (Port 5173)       │
│                                          │
│  Login / Register → CAPTCHA Earn → Wallet│
│                                          │
│  ► JWT stored in localStorage            │
│  ► Balance, result, reward → from API    │
│  ► correctOption → NEVER received        │
└───────────────┬─────────────────────────┘
                │  HTTP / JSON (Axios)
                ▼
┌─────────────────────────────────────────┐
│        Express API  (Port 5000)          │
│                                          │
│  Helmet · CORS · Rate Limiter · JWT Auth │
│  ┌────────────┬──────────────┬─────────┐ │
│  │ /api/auth  │ /api/captcha │/api/wallet│
│  └────────────┴──────────────┴─────────┘ │
│                                          │
│  Services: auth · captcha · reward       │
│  Models:   User · CaptchaChallenge       │
│            Wallet · GemTransaction       │
│            CaptchaRewardConfig           │
└───────────────┬─────────────────────────┘
                │  Mongoose / mongodb+srv
                ▼
┌─────────────────────────────────────────┐
│           MongoDB Atlas                  │
└─────────────────────────────────────────┘
```

---

## Tech Stack

### Backend
| Package | Version | Purpose |
|---|---|---|
| Node.js | 18+ | Runtime |
| Express | ^4.19 | HTTP framework |
| Mongoose | ^8.4 | MongoDB ODM |
| bcryptjs | ^2.4 | Password hashing (12 rounds) |
| jsonwebtoken | ^9.0 | JWT generation + verification |
| express-validator | ^7.1 | Request body validation |
| express-rate-limit | ^7.3 | Per-endpoint rate limiting |
| helmet | ^7.1 | Secure HTTP headers |
| cors | ^2.8 | CORS policy |
| dotenv | ^16.4 | Environment variable loading |

### Frontend
| Package | Version | Purpose |
|---|---|---|
| React | ^19.2 | UI library |
| Vite | ^8.3 | Build tool + dev server |
| React Router DOM | ^7.18 | Client-side routing |
| Axios | ^1.20 | HTTP client with interceptors |
| Lucide React | ^1.48 | Icon library |

### Database
- **MongoDB Atlas** — M0 free tier, replica set of 3 nodes

---

## Local Setup

### Prerequisites

- Node.js 18 or higher
- A MongoDB Atlas account (free M0 cluster)
- Git

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd vellop
```

### 2. Backend setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env — fill in MONGO_URI and JWT_SECRET
```

### 3. Frontend setup

```bash
cd frontend
npm install
cp .env.example .env
# Edit .env — set VITE_API_BASE_URL=http://localhost:5000/api
```

### 4. MongoDB Atlas setup

1. Create a free M0 cluster at [cloud.mongodb.com](https://cloud.mongodb.com)
2. Add a database user: **Database Access → Add New Database User**
3. Whitelist your IP: **Network Access → Add IP Address → Allow Access from Anywhere** (for development)
4. Get the connection string: **Database → Connect → Drivers**
5. Replace `<password>` in the URI and paste into `backend/.env` as `MONGO_URI`

> **DNS note:** If Node.js reports `querySrv ECONNREFUSED` for the Atlas SRV record, the fix is already applied in `src/config/db.js` — it sets public DNS resolvers (8.8.8.8, 1.1.1.1) before connecting.

---

## Environment Variables

See [`backend/.env.example`](./backend/.env.example) and [`frontend/.env.example`](./frontend/.env.example) for all variables with descriptions.

**Required backend variables:**

| Variable | Description |
|---|---|
| `MONGO_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | ≥64-character random secret for signing tokens |
| `PORT` | API port (default `5000`) |
| `FRONTEND_URL` | Comma-separated CORS-allowed origins |

**Required frontend variable:**

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Backend API base URL (e.g. `http://localhost:5000/api`) |

---

## Running Locally

### Start the backend (development)

```bash
cd backend
npm run dev        # nodemon — auto-restarts on changes
```

Expected output:
```
[Server] VELoop API running on port 5000 (development)
[DB] MongoDB connected: ac-xxxxx-shard-00-00.xxxxx.mongodb.net
```

### Start the frontend (development)

```bash
cd frontend
npm run dev        # Vite dev server on http://localhost:5173
```

Open **http://localhost:5173** in your browser.

---

## API Overview

Base URL: `http://localhost:5000/api`

All protected routes require `Authorization: Bearer <token>` header.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | No | Health check |
| `POST` | `/auth/register` | No | Register new user |
| `POST` | `/auth/login` | No | Login, receive JWT |
| `GET` | `/auth/me` | Yes | Get current user |
| `GET` | `/captcha/current` | Yes | Get/create active CAPTCHA |
| `POST` | `/captcha/verify` | Yes | Submit answer, receive reward |
| `POST` | `/captcha/claim` | Yes | Acknowledge reward claim |
| `POST` | `/captcha/new` | Yes | Skip to a fresh CAPTCHA |
| `GET` | `/wallet/gems` | Yes | Get Gem balance |
| `GET` | `/wallet/transactions` | Yes | Get transaction history |

See [`docs/API.md`](./docs/API.md) for full request/response documentation.

---

## Testing

### Backend unit/integration tests (180 tests — no live DB required)

```bash
cd backend
node stage2-tests.js    # 16 tests — JWT authentication
node stage3-tests.js    # 28 tests — CAPTCHA generation & verification
node stage4-tests.js    # 38 tests — Gem rewards & wallet
node stage5-tests.js    # 38 tests — Claim + No Thanks flow
node stage6-tests.js    # 60 tests — Security & abuse protection
```

### Live integration tests (65 tests — requires running server + Atlas)

```bash
cd backend
node server.js          # start the server first (or npm run dev)
# Then run the integration script (see docs/TESTING.md)
```

See [`docs/TESTING.md`](./docs/TESTING.md) for the complete test reference.

---

## Security Notes

- The `correctOption` is stored with `select: false` in Mongoose and is stripped by `toSafeChallenge()` — it **never** appears in any API response.
- `req.body.userId`, `req.body.isCorrect`, and `req.body.reward` are rejected with 422 if submitted by the client (validated via `express-validator`).
- Wallet balance is updated server-side via atomic `$inc` operations only.
- Every verify and claim uses an atomic `findOneAndUpdate` to prevent replay and double-spend.
- All API routes are protected by JWT (`Authorization: Bearer <token>`).
- Rate limits are applied globally and per-endpoint.

See [`docs/SECURITY.md`](./docs/SECURITY.md) for the full security reference.

---

## Demo Flow

1. Open **http://localhost:5173**
2. Click **Create an account** → Register with name, email, password
3. Log in with your credentials
4. You land on the **CAPTCHA Earn** page
   - A 6-character CAPTCHA text is displayed
   - Four option buttons appear below
   - A countdown timer shows time remaining
5. Click any option → **Verify Answer** button activates
6. Click **Verify Answer**
   - Backend verifies, awards Gems (1.0 GEM correct / 0.5 GEM wrong)
   - Result card shows: **CORRECT** ✓ or **WRONG** ✗ + reward amount
7. Click **✓ Claim Reward** → reward is acknowledged, new CAPTCHA loads
   - OR click **No Thanks →** → skip without claiming, new CAPTCHA loads
8. Click **Wallet** in the navbar to see your Gem balance and transaction history
9. Click the logout icon in the navbar → session cleared, redirected to login

---

## Deployment

> Stage 9 — documentation complete. Deployment is the next step.

### Quick deployment checklist

- [ ] Change `JWT_SECRET` to a 64+ character cryptographically random string
- [ ] Set `NODE_ENV=production` in backend
- [ ] Set `FRONTEND_URL` to your deployed frontend origin (no trailing slash)
- [ ] Set `VITE_API_BASE_URL` to your deployed backend URL
- [ ] Restrict MongoDB Atlas Network Access to server IPs only
- [ ] Run `npm run build` in frontend → serve `dist/` from a static host
- [ ] Backend: use a process manager (PM2) or containerize with Docker
- [ ] Set up HTTPS — never run production without TLS

Recommended platforms:
- **Backend:** Render, Railway, Fly.io
- **Frontend:** Vercel, Netlify, Cloudflare Pages
- **Database:** MongoDB Atlas (already in use)
