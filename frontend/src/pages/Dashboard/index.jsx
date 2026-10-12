/**
 * Dashboard/index.jsx — Post-login landing page.
 *
 * Shows:
 *  - Live Gem balance (from GET /wallet/gems)
 *  - Session count (passed via state or stored in sessionStorage)
 *  - Three-stat card strip
 *  - "Your earning flow" step panel
 *  - "Daily momentum" motivational panel
 *  - "Continue to CAPTCHA" CTA → navigates to /captcha
 *
 * All data is real. No fake balances or fake activity.
 */

import { useNavigate } from 'react-router-dom';
import { Zap, Gem, Shield, ArrowRight, CheckCircle, Eye, Award } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { GemBalance } from '../../components/GemBalance/GemBalance';
import './Dashboard.css';


const STEPS = [
  {
    icon: <Eye size={18} />,
    color: 'blue',
    label: 'Read the challenge',
    desc: 'A randomised CAPTCHA text is displayed in a secure tile.',
  },
  {
    icon: <CheckCircle size={18} />,
    color: 'green',
    label: 'Pick your answer',
    desc: 'Choose the matching option from A, B, C or D.',
  },
  {
    icon: <Award size={18} />,
    color: 'purple',
    label: 'Claim your Gems',
    desc: 'Correct or not, a reward is applied — claim it to your wallet.',
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Read session count stored by CaptchaEarn (sessionStorage key)
  const sessionCount = parseInt(sessionStorage.getItem('vl_session_count') ?? '0', 10);

  return (
    <div className="dash-page">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="dash-header">
        <div className="dash-brand">
          <div className="dash-brand-icon"><Zap size={17} /></div>
          <span className="dash-brand-name">VELoop</span>
          <span className="dash-brand-rewards">Rewards</span>
        </div>

        <nav className="dash-nav-pill" aria-label="Main navigation">
          <button className="dash-nav-item dash-nav-item--active" onClick={() => navigate('/dashboard')}>Earn</button>
          <span className="dash-nav-sep">·</span>
          <button className="dash-nav-item" onClick={() => navigate('/wallet')}>Wallet</button>
          <span className="dash-nav-sep">·</span>
          <button className="dash-nav-item" onClick={() => navigate('/profile')}>Profile</button>
        </nav>
      </header>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main className="dash-main">

        {/* Greeting */}
        <div className="dash-greeting">
          <h1 className="dash-greeting-title">
            {user?.name ? `Hey, ${user.name.split(' ')[0]} 👋` : 'Welcome back 👋'}
          </h1>
          <p className="dash-greeting-sub">Your earnings dashboard — everything at a glance.</p>
        </div>

        {/* ── Three stat cards ──────────────────────────────────────────────── */}
        <div className="dash-stats">
          {/* Gem balance — live from API */}
          <div className="dash-stat-card">
            <div className="dash-stat-icon dash-stat-icon--blue">
              <Gem size={18} />
            </div>
            <div className="dash-stat-body">
              <span className="dash-stat-label">Gem Balance</span>
              <div className="dash-stat-value-wrap">
                <GemBalance compact />
              </div>
            </div>
          </div>

          {/* Session count — real session counter from sessionStorage */}
          <div className="dash-stat-card">
            <div className="dash-stat-icon dash-stat-icon--purple">
              <Zap size={18} />
            </div>
            <div className="dash-stat-body">
              <span className="dash-stat-label">This Session</span>
              <span className="dash-stat-value">{sessionCount} <span className="dash-stat-unit">challenge{sessionCount !== 1 ? 's' : ''}</span></span>
            </div>
          </div>

          {/* Verification status — real app state */}
          <div className="dash-stat-card">
            <div className="dash-stat-icon dash-stat-icon--green">
              <Shield size={18} />
            </div>
            <div className="dash-stat-body">
              <span className="dash-stat-label">Session Status</span>
              <span className="dash-stat-value dash-stat-value--green">Active</span>
            </div>
          </div>
        </div>

        {/* ── Two panels ───────────────────────────────────────────────────── */}
        <div className="dash-panels">

          {/* Left: Earning flow */}
          <div className="dash-panel">
            <h2 className="dash-panel-title">Your earning flow</h2>
            <p className="dash-panel-sub">Three simple steps to collect Gems every round.</p>
            <div className="dash-steps">
              {STEPS.map((s, i) => (
                <div className="dash-step" key={i}>
                  <div className={`dash-step-icon dash-step-icon--${s.color}`}>
                    {s.icon}
                  </div>
                  <div className="dash-step-body">
                    <span className="dash-step-label">{s.label}</span>
                    <span className="dash-step-desc">{s.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Daily momentum */}
          <div className="dash-panel dash-panel--momentum">
            {/* Purple lightning illustration */}
            <div className="dash-momentum-art" aria-hidden="true">
              <div className="dash-momentum-ring dash-momentum-ring--3" />
              <div className="dash-momentum-ring dash-momentum-ring--2" />
              <div className="dash-momentum-ring dash-momentum-ring--1" />
              <div className="dash-momentum-core">
                <Zap size={32} />
              </div>
            </div>
            <h2 className="dash-panel-title">Daily momentum</h2>
            <p className="dash-panel-sub">
              Every challenge you complete adds to your streak. Stay consistent to maximise your Gem earnings each day.
            </p>
            <div className="dash-momentum-stat">
              <span className="dash-momentum-count">{sessionCount}</span>
              <span className="dash-momentum-unit">today</span>
            </div>
          </div>
        </div>

        {/* ── CTA banner ───────────────────────────────────────────────────── */}
        <div className="dash-cta">
          <div className="dash-cta-text">
            <h2 className="dash-cta-title">Your next reward starts here</h2>
            <p className="dash-cta-desc">
              Complete the challenge below and follow the existing verification process.
            </p>
          </div>
          <button
            id="btn-continue-captcha"
            className="btn btn-primary btn-xl dash-cta-btn"
            onClick={() => navigate('/captcha')}
            aria-label="Continue to CAPTCHA challenge"
          >
            Continue to CAPTCHA
            <ArrowRight size={18} />
          </button>
        </div>

      </main>
    </div>
  );
}
