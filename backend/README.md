# VELoop Rewards — Backend API

## Project Overview

VELoop Rewards is a CAPTCHA Earn platform where users solve CAPTCHA challenges to earn gem rewards. This repository contains the **backend API** built with Node.js, Express, and MongoDB.

The backend is the sole source of truth for:

- User identity and authentication
- CAPTCHA challenge generation and verification
- Reward calculation
- Gem balance and transactions
- Claim status

> **Note:** This README documents only what has been implemented in the current stage. CAPTCHA, rewards, wallet, and authentication will be documented as each stage is completed.

---

## Technology Stack

| Layer         | Technology               |
|---------------|--------------------------|
| Runtime       | Node.js                  |
| Framework     | Express.js               |
| Database      | MongoDB (via Mongoose)   |
| Auth (future) | JSON Web Tokens (JWT)    |
| Security      | Helmet, CORS, Rate Limit |
| Validation    | express-validator        |
| Dev Server    | nodemon                  |

---

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── db.js               # MongoDB connection
│   ├── controllers/            # Route handlers (added per module)
│   ├── middleware/
│   │   └── error.middleware.js # Centralized error & 404 handling
│   ├── models/                 # Mongoose schemas (added per module)
│   ├── routes/
│   │   └── health.routes.js    # Health-check endpoint
│   ├── services/               # Business logic (added per module)
│   ├── validators/             # Request validation rules (added per module)
│   └── utils/                  # Shared utility helpers
├── .env                        # Local environment variables (git-ignored)
├── .env.example                # Environment variable template
├── .gitignore
├── server.js                   # Express app entry point
├── package.json
└── README.md
```

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- A running MongoDB instance (local or [MongoDB Atlas](https://www.mongodb.com/cloud/atlas))

---

## Installation

```bash
# 1. Navigate into the backend directory
cd backend

# 2. Install all dependencies
npm install
```

---

## Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

| Variable      | Required | Description                              |
|---------------|----------|------------------------------------------|
| `PORT`        | No       | Port to run the server on (default 5000) |
| `MONGO_URI`   | **Yes**  | Full MongoDB connection string           |
| `JWT_SECRET`  | **Yes**  | Secret key for signing JWT tokens        |
| `NODE_ENV`    | No       | `development` or `production`            |

> **Never** commit `.env` to version control. It is already listed in `.gitignore`.

---

## Running the Server

```bash
# Development (auto-restarts on file changes)
npm run dev

# Production
npm start
```

Expected startup output:

```
[DB] MongoDB connected: localhost
[Server] VELoop API running on port 5000 (development)
```

---

## API Endpoints

### Health Check

```
GET /api/health
```

**Response:**

```json
{
  "success": true,
  "message": "VELoop API is running"
}
```

---

## API Response Format

All API responses follow a consistent structure:

**Success**
```json
{
  "success": true,
  "data": {}
}
```

**Error**
```json
{
  "success": false,
  "message": "Descriptive error message"
}
```

---

## Security Measures (Current Stage)

- **Helmet** — Sets secure HTTP response headers
- **CORS** — Configurable allowed origins
- **Rate Limiting** — 100 requests / 15 min / IP on all `/api` routes
- **Body Size Limit** — JSON and URL-encoded bodies capped at 10 KB
- **Environment Variables** — No secrets hardcoded anywhere
- **Error Handler** — Stack traces hidden in production responses

---

## Upcoming Stages

- Stage 2: JWT Authentication (register / login)
- Stage 3: CAPTCHA challenge generation and verification
- Stage 4: Gem reward calculation
- Stage 5: Gem wallet and transaction history
- Stage 6: Claim and "No Thanks" flow
- Stage 7: React frontend
