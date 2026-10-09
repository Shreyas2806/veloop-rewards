/**
 * wallet.service.js
 * Wraps wallet API calls.
 *
 * API contracts (from backend):
 *
 * GET /wallet/gems         → { success, data: { balance, currency } }
 *   balance: number (display Gems, e.g. 1.5)
 *
 * GET /wallet/transactions → { success, data: { transactions[] } }
 *   transaction: { transactionId, type, amount, currency, status, createdAt, referenceId }
 *   amount: display Gems (half-units already converted by backend)
 */

import api from './api';

export const walletService = {
  getGemBalance: async () => {
    const res = await api.get('/wallet/gems');
    return res.data; // { success, data: { balance, currency } }
  },

  getTransactions: async ({ limit = 50, skip = 0 } = {}) => {
    const res = await api.get('/wallet/transactions', { params: { limit, skip } });
    return res.data; // { success, data: { transactions } }
  },
};
