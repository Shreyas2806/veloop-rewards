/**
 * api.js — Centralized Axios API client.
 *
 * Responsibilities:
 *  - Sets base URL from VITE_API_BASE_URL environment variable.
 *  - Attaches Authorization: Bearer <token> on every authenticated request.
 *  - Parses error responses into consistent { message, status } objects.
 *  - On 401: clears stored token and redirects to /login (session expiry).
 *  - Never stores business logic (rewards, balance, correctness).
 */

import axios from 'axios';
import { storage } from '../utils/storage';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// ── Request interceptor: attach JWT ──────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = storage.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor: normalize errors ───────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      // Network / timeout error
      return Promise.reject({
        message: 'Unable to connect to the server. Please check your connection.',
        status: 0,
      });
    }

    const { status, data } = error.response;
    const message =
      data?.message || data?.error || `Request failed with status ${status}`;

    // Global 401 handler — session expired or token invalid.
    // Clear token so AuthContext won't re-validate a dead token on next mount.
    // Only redirect if we're not already on the login page to avoid loops.
    if (status === 401) {
      storage.clearToken();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }

    return Promise.reject({ message, status, errors: data?.errors });
  }
);

export default api;

