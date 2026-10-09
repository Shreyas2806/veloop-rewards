/**
 * captcha.service.js
 * Wraps CAPTCHA API calls.
 *
 * API contracts (from backend):
 *
 * GET  /captcha/current           → { success, data: { challenge } }
 *   challenge: { challengeId, captchaText, options[], expiresAt, status }
 *   NOTE: correctOption is NEVER returned.
 *
 * POST /captcha/verify            → { success, data: { result, reward, challenge } }
 *   body: { challengeId, selectedOption }
 *   result: 'CORRECT' | 'WRONG'
 *   reward: { amount, currency }   (e.g. amount: 1.0 or 0.5)
 *
 * POST /captcha/claim             → { success, data: { challengeId, claimStatus, claimedAt } }
 *   body: { challengeId }
 *
 * POST /captcha/new               → { success, data: { challenge } }
 *   body: { previousChallengeId? }
 */

import api from './api';

export const captchaService = {
  getCurrentCaptcha: async () => {
    const res = await api.get('/captcha/current');
    return res.data; // { success, data: { challenge } }
  },

  verifyCaptcha: async (challengeId, selectedOption) => {
    const res = await api.post('/captcha/verify', { challengeId, selectedOption });
    return res.data; // { success, data: { result, reward, challenge } }
  },

  claimCaptcha: async (challengeId) => {
    const res = await api.post('/captcha/claim', { challengeId });
    return res.data; // { success, data: { challengeId, claimStatus } }
  },

  requestNewCaptcha: async (previousChallengeId) => {
    const body = previousChallengeId ? { previousChallengeId } : {};
    const res = await api.post('/captcha/new', body);
    return res.data; // { success, data: { challenge } }
  },
};
