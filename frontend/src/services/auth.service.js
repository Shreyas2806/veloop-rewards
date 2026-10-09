/**
 * auth.service.js
 * Wraps auth API calls. Controllers consume this, not raw axios.
 *
 * API contracts (from backend):
 *
 * POST /auth/register  → { success, message, data: { user } }
 * POST /auth/login     → { success, message, data: { token, user } }
 * GET  /auth/me        → { success, data: { user } }
 */

import api from './api';

export const authService = {
  register: async ({ name, email, password }) => {
    const res = await api.post('/auth/register', { name, email, password });
    return res.data; // { success, message, data: { user } }
  },

  login: async ({ email, password }) => {
    const res = await api.post('/auth/login', { email, password });
    return res.data; // { success, message, data: { token, user } }
  },

  me: async () => {
    const res = await api.get('/auth/me');
    return res.data; // { success, data: { user } }
  },
};
