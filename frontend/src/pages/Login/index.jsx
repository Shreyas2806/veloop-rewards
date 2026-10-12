/**
 * Login/index.jsx — Login page.
 * Calls POST /api/auth/login via AuthContext.login().
 * Stores token via AuthContext (which uses storage.js).
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Zap, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import './Login.css';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError('Please fill in all fields.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login({ email: form.email, password: form.password });
      navigate('/dashboard');
    } catch (err) {
      const status = err?.status;
      if (status === 401)      setError('Invalid email or password.');
      else if (status === 429) setError('Too many attempts. Please wait a moment.');
      else                     setError(err?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* ── Brand panel (desktop only) ── */}
      <aside className="auth-panel">
        <div className="auth-panel-logo">
          <div className="auth-panel-icon"><Zap size={24} /></div>
          <div>
            <span className="auth-panel-brand">VELoop</span>
            <span className="auth-panel-sub">Rewards</span>
          </div>
        </div>
        <h2 className="auth-panel-heading">
          Earn <em>Gems</em> while you browse
        </h2>
        <p className="auth-panel-desc">
          Solve CAPTCHA challenges and get rewarded instantly. Your wallet, your earnings.
        </p>
        <div className="auth-panel-features">
          {['Instant gem rewards per challenge', 'Track your earnings in real time', 'Claim or roll over — your choice', 'Secure, session-based authentication'].map((f) => (
            <div className="auth-panel-feature" key={f}>
              <div className="auth-feature-dot" />
              {f}
            </div>
          ))}
        </div>
      </aside>

      {/* ── Form panel ── */}
      <div className="auth-form-panel">
        <div className="auth-card">
          {/* Mobile-only logo */}
          <div className="auth-mobile-logo">
            <div className="auth-mobile-icon"><Zap size={18} /></div>
            <div>
              <span className="auth-brand">VELoop</span>
              <span className="auth-brand-sub">Rewards</span>
            </div>
          </div>

          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-desc">Sign in to continue earning Gems</p>

          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="field">
              <label htmlFor="login-email" className="field-label">Email</label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                className="field-input"
                placeholder="you@example.com"
                value={form.email}
                onChange={handleChange}
                disabled={loading}
              />
            </div>

            <div className="field">
              <label htmlFor="login-password" className="field-label">Password</label>
              <div className="field-input-wrap">
                <input
                  id="login-password"
                  name="password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="field-input"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={handleChange}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="field-eye"
                  onClick={() => setShowPw(!showPw)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && <p className="auth-error" role="alert">{error}</p>}

            <button
              id="btn-login"
              type="submit"
              className="btn btn-primary btn-full btn-lg"
              disabled={loading}
            >
              {loading ? <><span className="btn-spinner" /> Signing in…</> : 'Sign In'}
            </button>
          </form>

          <p className="auth-footer">
            Don&rsquo;t have an account?{' '}
            <Link to="/register" className="auth-link">Create one</Link>
          </p>
        </div>

        {/* Ambient blobs */}
        <div className="auth-blob auth-blob--1" />
        <div className="auth-blob auth-blob--2" />
      </div>
    </div>
  );
}
