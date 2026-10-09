/**
 * Register/index.jsx — Registration page.
 * Calls POST /api/auth/register, then redirects to /login.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Zap, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import '../Login/Login.css';
import './Register.css';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.email)       e.email = 'Email is required';
    if (form.password.length < 8) e.password = 'Password must be at least 8 characters';
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match';
    return e;
  };

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setErrors((er) => ({ ...er, [e.target.name]: '' }));
    setApiError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    setApiError('');
    try {
      await register({ name: form.name, email: form.email, password: form.password });
      navigate('/login', { state: { registered: true } });
    } catch (err) {
      const status = err?.status;
      if (status === 409) setApiError('An account with this email already exists.');
      else if (status === 422) setApiError('Please check your inputs and try again.');
      else if (status === 429) setApiError('Too many attempts. Please wait a moment.');
      else setApiError(err?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon"><Zap size={22} /></div>
          <div>
            <span className="auth-brand">VELoop</span>
            <span className="auth-brand-sub">Rewards</span>
          </div>
        </div>

        <h1 className="auth-title">Create account</h1>
        <p className="auth-desc">Start earning Gems with every CAPTCHA</p>

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="field">
            <label htmlFor="reg-name" className="field-label">Name</label>
            <input id="reg-name" name="name" type="text" autoComplete="name"
              className={`field-input${errors.name ? ' field-input--error' : ''}`}
              placeholder="Your name" value={form.name} onChange={handleChange} disabled={loading} />
            {errors.name && <span className="field-err">{errors.name}</span>}
          </div>

          <div className="field">
            <label htmlFor="reg-email" className="field-label">Email</label>
            <input id="reg-email" name="email" type="email" autoComplete="email"
              className={`field-input${errors.email ? ' field-input--error' : ''}`}
              placeholder="you@example.com" value={form.email} onChange={handleChange} disabled={loading} />
            {errors.email && <span className="field-err">{errors.email}</span>}
          </div>

          <div className="field">
            <label htmlFor="reg-password" className="field-label">Password</label>
            <div className="field-input-wrap">
              <input id="reg-password" name="password"
                type={showPw ? 'text' : 'password'} autoComplete="new-password"
                className={`field-input${errors.password ? ' field-input--error' : ''}`}
                placeholder="Min 8 characters" value={form.password} onChange={handleChange} disabled={loading} />
              <button type="button" className="field-eye"
                onClick={() => setShowPw(!showPw)} aria-label="Toggle password" tabIndex={-1}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && <span className="field-err">{errors.password}</span>}
          </div>

          <div className="field">
            <label htmlFor="reg-confirm" className="field-label">Confirm Password</label>
            <input id="reg-confirm" name="confirm" type="password" autoComplete="new-password"
              className={`field-input${errors.confirm ? ' field-input--error' : ''}`}
              placeholder="Repeat password" value={form.confirm} onChange={handleChange} disabled={loading} />
            {errors.confirm && <span className="field-err">{errors.confirm}</span>}
          </div>

          {apiError && <p className="auth-error" role="alert">{apiError}</p>}

          <button id="btn-register" type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? <><span className="btn-spinner" /> Creating account…</> : 'Create Account'}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account?{' '}
          <Link to="/login" className="auth-link">Sign in</Link>
        </p>
      </div>
      <div className="auth-blob auth-blob--1" />
      <div className="auth-blob auth-blob--2" />
    </div>
  );
}
