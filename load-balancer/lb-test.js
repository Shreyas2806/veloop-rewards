#!/usr/bin/env node
/**
 * lb-test.js — Verifies the Nginx load balancer distributes requests
 *              across both backend instances and that all API flows work.
 *
 * Run AFTER `docker compose up --build` is healthy:
 *   node load-balancer/lb-test.js
 *
 * Requires: Node 18+ (uses native fetch).
 * Does NOT modify any application code or database records beyond what
 * the normal CAPTCHA earn flow would produce.
 */

'use strict';

const BASE = process.env.LB_URL || 'http://localhost:8080/api';
const PASS = '\x1b[32m✔\x1b[0m';
const FAIL = '\x1b[31m✘\x1b[0m';

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ${PASS}  ${label}`);
    passed++;
  } else {
    console.log(`  ${FAIL}  ${label}${detail ? `  →  ${detail}` : ''}`);
    failed++;
  }
}

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json, headers: res.headers };
}

// ── helpers ────────────────────────────────────────────────────────────────────
const randEmail = () => `lb-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

async function run() {
  console.log(`\n━━━  VELoop LB Test Suite  ━━━  target: ${BASE}\n`);

  // ── 1. Nginx health ────────────────────────────────────────────────────────
  console.log('1. Nginx health endpoint');
  const nh = await fetch(`${BASE.replace('/api', '')}/nginx-health`);
  const nhBody = await nh.json().catch(() => ({}));
  assert('GET /nginx-health → 200', nh.status === 200);
  assert('response has status:ok', nhBody.status === 'ok');

  // ── 2. Backend health (through proxy) ─────────────────────────────────────
  console.log('\n2. Backend health (proxied)');
  const h = await api('GET', '/health');
  assert('GET /api/health → 200', h.status === 200);

  // ── 3. Round-robin distribution ────────────────────────────────────────────
  console.log('\n3. Round-robin distribution (20 requests)');
  const instancesSeen = new Set();
  for (let i = 0; i < 20; i++) {
    const r = await api('GET', '/health');
    const inst = r.body?.data?.instanceId || r.headers.get('x-instance-id') || null;
    if (inst) instancesSeen.add(inst);
  }
  // If INSTANCE_ID env var is surfaced by the health endpoint, we can verify distribution.
  // If not, we rely on the Nginx access log showing alternating upstream addresses.
  if (instancesSeen.size > 0) {
    assert('Requests hit more than one instance', instancesSeen.size >= 2,
      `only saw: ${[...instancesSeen].join(', ')}`);
  } else {
    console.log(`  ⓘ  INSTANCE_ID not surfaced by /api/health — verify distribution via Nginx access log:`);
    console.log(`     docker logs veloop-nginx-lb | grep upstream`);
  }

  // ── 4. CORS preflight through proxy ───────────────────────────────────────
  console.log('\n4. CORS preflight (OPTIONS) through proxy');
  const origin = 'http://localhost:5173';
  const preflight = await fetch(`${BASE}/auth/register`, {
    method: 'OPTIONS',
    headers: {
      'Origin': origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type,Authorization',
    },
  });
  assert('OPTIONS /api/auth/register → not 404',
    preflight.status !== 404, `got ${preflight.status}`);
  assert('OPTIONS status is 2xx or 204',
    preflight.status >= 200 && preflight.status < 300, `got ${preflight.status}`);

  // ── 5. Register ────────────────────────────────────────────────────────────
  console.log('\n5. Registration');
  const email = randEmail();
  const reg = await api('POST', '/auth/register', {
    name: 'LB Tester',
    email,
    password: 'LBtest123!',
  });
  assert('POST /auth/register → 201', reg.status === 201, `got ${reg.status}`);
  assert('response has user object', !!reg.body?.data?.user);

  // ── 6. Login ───────────────────────────────────────────────────────────────
  console.log('\n6. Login');
  const login = await api('POST', '/auth/login', { email, password: 'LBtest123!' });
  assert('POST /auth/login → 200', login.status === 200);
  const token = login.body?.data?.token;
  assert('token returned', !!token);

  if (!token) {
    console.log('\n  ✘  Cannot continue — no token.\n');
    summary(); return;
  }

  // ── 7. JWT-protected endpoint works regardless of instance ─────────────────
  console.log('\n7. JWT-protected /auth/me (5 requests — may hit different instances)');
  for (let i = 0; i < 5; i++) {
    const me = await api('GET', '/auth/me', null, token);
    assert(`/auth/me request ${i + 1} → 200`, me.status === 200);
  }

  // ── 8. CAPTCHA flow ────────────────────────────────────────────────────────
  console.log('\n8. CAPTCHA earn flow');
  const cur = await api('GET', '/captcha/current', null, token);
  assert('GET /captcha/current → 200', cur.status === 200);
  const challenge = cur.body?.data?.challenge;
  assert('challenge returned', !!challenge?.challengeId);
  assert('correctOption NOT in response', !('correctOption' in (challenge || {})));
  assert('options array has 4 entries', challenge?.options?.length === 4);

  if (!challenge) { summary(); return; }

  // Pick any option (we don't know which is correct — correct)
  const selectedOption = challenge.options[0];
  const verify = await api('POST', '/captcha/verify', {
    challengeId: challenge.challengeId,
    selectedOption,
  }, token);
  assert('POST /captcha/verify → 200', verify.status === 200);
  const vResult = verify.body?.data?.result;
  assert('result is CORRECT or WRONG', vResult === 'CORRECT' || vResult === 'WRONG');
  assert('correctOption NOT in verify response', !('correctOption' in (verify.body?.data || {})));
  const rewardAmount = verify.body?.data?.reward?.amount;
  assert('reward amount present', rewardAmount !== undefined);

  // ── 9. Wallet consistency ──────────────────────────────────────────────────
  console.log('\n9. Wallet consistency');
  const wallet = await api('GET', '/wallet/gems', null, token);
  assert('GET /wallet/gems → 200', wallet.status === 200);
  const balance = wallet.body?.data?.balance;
  assert('balance is a number', typeof balance === 'number');
  assert('balance >= reward amount', balance >= rewardAmount);

  const txns = await api('GET', '/wallet/transactions', null, token);
  assert('GET /wallet/transactions → 200', txns.status === 200);
  assert('transactions is an array', Array.isArray(txns.body?.data?.transactions));

  // ── 10. Claim ──────────────────────────────────────────────────────────────
  console.log('\n10. Claim flow');
  const claim = await api('POST', '/captcha/claim', {
    challengeId: challenge.challengeId,
  }, token);
  assert('POST /captcha/claim → 200', claim.status === 200);
  assert('claimStatus is CLAIMED', claim.body?.data?.claimStatus === 'CLAIMED');

  // Double-claim must be rejected
  const claim2 = await api('POST', '/captcha/claim', {
    challengeId: challenge.challengeId,
  }, token);
  assert('Duplicate claim → 409', claim2.status === 409,
    `got ${claim2.status} — duplicate reward protection must hold`);

  // ── 11. No Thanks ──────────────────────────────────────────────────────────
  console.log('\n11. No Thanks flow');
  const cur2 = await api('GET', '/captcha/current', null, token);
  const ch2 = cur2.body?.data?.challenge;
  if (ch2) {
    const noThanks = await api('POST', '/captcha/new', {
      previousChallengeId: ch2.challengeId,
    }, token);
    assert('POST /captcha/new → 200', noThanks.status === 200);
    const newCh = noThanks.body?.data?.challenge;
    assert('new challenge returned', !!newCh?.challengeId);
    assert('new challengeId differs from previous',
      newCh?.challengeId !== ch2.challengeId);
  }

  // ── 12. Instance failure simulation note ──────────────────────────────────
  console.log('\n12. Instance failure note');
  console.log('  ⓘ  To test failover:');
  console.log('     docker stop veloop-backend-1');
  console.log('     curl http://localhost:8080/api/health   ← should still succeed');
  console.log('     docker start veloop-backend-1');

  summary();
}

function summary() {
  const total = passed + failed;
  console.log(`\n━━━  Result: ${passed}/${total} passed`);
  if (failed > 0) {
    console.log(`     ${FAIL}  ${failed} failed\n`);
    process.exit(1);
  } else {
    console.log(`     ${PASS}  All passed\n`);
  }
}

run().catch((err) => {
  console.error('\n  Fatal error:', err.message);
  process.exit(1);
});
