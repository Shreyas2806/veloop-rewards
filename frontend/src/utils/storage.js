/**
 * storage.js — Safe localStorage utility.
 * Only the auth token is persisted locally.
 * Wallet balance, rewards, and challenge state are NEVER stored here.
 */

const TOKEN_KEY = 'veloop_auth_token';

export const storage = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (token) => localStorage.setItem(TOKEN_KEY, token),
  clearToken: () => localStorage.removeItem(TOKEN_KEY),
};
