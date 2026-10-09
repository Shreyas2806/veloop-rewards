/**
 * AuthContext.jsx — Application-wide authentication state.
 *
 * Responsibilities:
 *  - Holds the current user and auth token.
 *  - On mount: restores token from localStorage and validates via GET /auth/me.
 *  - Provides login(), logout(), register() helpers.
 *  - Does NOT hold CAPTCHA or wallet state.
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authService } from '../services/auth.service';
import { storage } from '../utils/storage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true while restoring session

  // ── On mount: restore session from stored token ──────────────────────────────
  useEffect(() => {
    const restore = async () => {
      const token = storage.getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await authService.me();
        setUser(res.data.user);
      } catch {
        // Token is invalid or expired — clear it
        storage.clearToken();
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    restore();
  }, []);

  // ── login ─────────────────────────────────────────────────────────────────────
  const login = useCallback(async ({ email, password }) => {
    const res = await authService.login({ email, password });
    const { token, user: userData } = res.data;
    storage.setToken(token);
    setUser(userData);
    return userData;
  }, []);

  // ── register ──────────────────────────────────────────────────────────────────
  const register = useCallback(async ({ name, email, password }) => {
    const res = await authService.register({ name, email, password });
    return res; // returns { success, message, data: { user } }
  }, []);

  // ── logout ────────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    storage.clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
