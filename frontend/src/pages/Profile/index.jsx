/**
 * Profile/index.jsx — User Profile page.
 * Displays user identity, real reward stats, membership status,
 * configurable app preferences, and quick action shortcuts.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Mail, Shield, Gem, Zap, CheckCircle2, Copy,
  Check, ArrowRight, ArrowLeft, LogOut, Settings, Award,
  Volume2, FastForward, Bell
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { walletService } from '../../services/wallet.service';
import { Navbar } from '../../components/Navbar/Navbar';
import './Profile.css';

export default function Profile() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [balance, setBalance] = useState(null);
  const [copied, setCopied] = useState(false);
  
  // Stored preferences with localStorage persistence
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('vl_pref_sound') !== 'false';
  });
  const [autoAdvance, setAutoAdvance] = useState(() => {
    return localStorage.getItem('vl_pref_autoadvance') === 'true';
  });
  const [notifications, setNotifications] = useState(() => {
    return localStorage.getItem('vl_pref_notifications') !== 'false';
  });

  // Read session challenges count from sessionStorage
  const sessionCount = parseInt(sessionStorage.getItem('vl_session_count') ?? '0', 10);

  useEffect(() => {
    let isMounted = true;
    walletService.getGemBalance()
      .then((res) => {
        if (isMounted && res?.data?.balance !== undefined) {
          setBalance(res.data.balance);
        }
      })
      .catch(() => {
        // Fallback to 0 if network issues occur
        if (isMounted) setBalance(0);
      });
    return () => { isMounted = false; };
  }, []);

  const handleCopyId = () => {
    const idToCopy = user?.id || user?._id || 'VL-USER-001';
    navigator.clipboard.writeText(idToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('vl_pref_sound', String(next));
  };

  const toggleAutoAdvance = () => {
    const next = !autoAdvance;
    setAutoAdvance(next);
    localStorage.setItem('vl_pref_autoadvance', String(next));
  };

  const toggleNotifications = () => {
    const next = !notifications;
    setNotifications(next);
    localStorage.setItem('vl_pref_notifications', String(next));
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Determine user rank based on balance
  const getRank = (gems) => {
    const val = Number(gems) || 0;
    if (val >= 100) return { title: 'Gold Champion', color: 'amber' };
    if (val >= 25)  return { title: 'Silver Master', color: 'purple' };
    return { title: 'Bronze Explorer', color: 'blue' };
  };

  const rank = getRank(balance);
  const initials = user?.name ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'U';

  return (
    <div className="profile-page">
      <Navbar />

      <main className="profile-main">
        {/* Subnav */}
        <div className="profile-subnav">
          <button className="profile-back-btn" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={16} />
            Back to Dashboard
          </button>
          <div className="profile-role-badge">
            <Award size={14} />
            {rank.title}
          </div>
        </div>

        {/* Hero Profile Card */}
        <div className="profile-hero">
          <div className="profile-hero-left">
            <div className="profile-avatar-wrap">
              <div className="profile-avatar">{initials}</div>
              <div className="profile-online-indicator" title="Account active" />
            </div>
            <div className="profile-identity">
              <div className="profile-name-row">
                <h1 className="profile-name">{user?.name || 'Rewards Member'}</h1>
                <span className="profile-verified-chip">
                  <CheckCircle2 size={13} />
                  Verified Earner
                </span>
              </div>
              <div className="profile-email-row">
                <Mail size={15} />
                <span>{user?.email || 'user@veloop.io'}</span>
              </div>
            </div>
          </div>

          <div className="profile-hero-actions">
            <button className="btn btn-secondary btn-md" onClick={handleLogout}>
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="profile-stats-grid">
          <div className="profile-stat-box">
            <div className="profile-stat-top">
              <span className="profile-stat-title">Gem Balance</span>
              <div className="profile-stat-icon profile-stat-icon--blue">
                <Gem size={17} />
              </div>
            </div>
            <div className="profile-stat-num">
              {balance !== null ? balance.toLocaleString() : '...'} 💎
            </div>
            <span className="profile-stat-sub">Available for payout</span>
          </div>

          <div className="profile-stat-box">
            <div className="profile-stat-top">
              <span className="profile-stat-title">Challenges Done</span>
              <div className="profile-stat-icon profile-stat-icon--purple">
                <Zap size={17} />
              </div>
            </div>
            <div className="profile-stat-num">{sessionCount}</div>
            <span className="profile-stat-sub">This active session</span>
          </div>

          <div className="profile-stat-box">
            <div className="profile-stat-top">
              <span className="profile-stat-title">Current Tier</span>
              <div className={`profile-stat-icon profile-stat-icon--${rank.color}`}>
                <Award size={17} />
              </div>
            </div>
            <div className="profile-stat-num">{rank.title.split(' ')[0]}</div>
            <span className="profile-stat-sub">Level 1 Member</span>
          </div>

          <div className="profile-stat-box">
            <div className="profile-stat-top">
              <span className="profile-stat-title">Security State</span>
              <div className="profile-stat-icon profile-stat-icon--green">
                <Shield size={17} />
              </div>
            </div>
            <div className="profile-stat-num" style={{ color: 'var(--success-l)', fontSize: '1.25rem' }}>
              Protected
            </div>
            <span className="profile-stat-sub">Bcrypt · JWT Secured</span>
          </div>
        </div>

        {/* Content Grid */}
        <div className="profile-grid">
          {/* Left Column: Account Details & Preferences */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Account Details */}
            <div className="profile-card">
              <div className="profile-card-header">
                <div className="profile-card-title-wrap">
                  <User size={18} className="profile-card-icon" />
                  <h2 className="profile-card-title">Account Details</h2>
                </div>
              </div>
              <div className="profile-info-list">
                <div className="profile-info-item">
                  <span className="profile-info-label">Member ID</span>
                  <span className="profile-info-val">
                    <code>{(user?.id || user?._id || 'VL-USER-8921').slice(-10)}</code>
                    <button
                      className="profile-copy-btn"
                      onClick={handleCopyId}
                      title="Copy full Member ID"
                    >
                      {copied ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                    </button>
                  </span>
                </div>
                <div className="profile-info-item">
                  <span className="profile-info-label">Status</span>
                  <span className="profile-info-val" style={{ color: 'var(--success-l)' }}>
                    Active & Good Standing
                  </span>
                </div>
                <div className="profile-info-item">
                  <span className="profile-info-label">Account Security</span>
                  <span className="profile-info-val">
                    Bcrypt 12-round Encrypted
                  </span>
                </div>
              </div>
            </div>

            {/* App Preferences */}
            <div className="profile-card">
              <div className="profile-card-header">
                <div className="profile-card-title-wrap">
                  <Settings size={18} className="profile-card-icon" />
                  <h2 className="profile-card-title">Preferences & Sound</h2>
                </div>
              </div>
              <div className="profile-toggles">
                <div className="profile-toggle-row">
                  <div className="profile-toggle-info">
                    <span className="profile-toggle-label">Interactive Sound Effects</span>
                    <span className="profile-toggle-desc">Audio cues upon correct CAPTCHAs & gem claims</span>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={soundEnabled} onChange={toggleSound} />
                    <span className="toggle-slider" />
                  </label>
                </div>

                <div className="profile-toggle-row">
                  <div className="profile-toggle-info">
                    <span className="profile-toggle-label">Auto-Advance Challenges</span>
                    <span className="profile-toggle-desc">Automatically load next CAPTCHA after claim</span>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={autoAdvance} onChange={toggleAutoAdvance} />
                    <span className="toggle-slider" />
                  </label>
                </div>

                <div className="profile-toggle-row">
                  <div className="profile-toggle-info">
                    <span className="profile-toggle-label">Streak Notifications</span>
                    <span className="profile-toggle-desc">Receive milestone alerts as your momentum rises</span>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={notifications} onChange={toggleNotifications} />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Shortcuts & Quick Navigation */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="profile-card">
              <div className="profile-card-header">
                <div className="profile-card-title-wrap">
                  <Zap size={18} className="profile-card-icon" />
                  <h2 className="profile-card-title">Quick Actions</h2>
                </div>
              </div>
              <div className="profile-actions-panel">
                <button className="profile-action-btn" onClick={() => navigate('/captcha')}>
                  <div className="profile-action-left">
                    <Zap size={16} color="var(--primary-l)" />
                    <span>Solve CAPTCHAs</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="profile-action-badge">Earn gems</span>
                    <ArrowRight size={15} color="var(--text-4)" />
                  </div>
                </button>

                <button className="profile-action-btn" onClick={() => navigate('/wallet')}>
                  <div className="profile-action-left">
                    <Gem size={16} color="var(--accent-l)" />
                    <span>My Wallet & Ledger</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="profile-action-badge">Transactions</span>
                    <ArrowRight size={15} color="var(--text-4)" />
                  </div>
                </button>

                <button className="profile-action-btn" onClick={() => navigate('/dashboard')}>
                  <div className="profile-action-left">
                    <Award size={16} color="var(--success-l)" />
                    <span>Main Dashboard</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="profile-action-badge">Overview</span>
                    <ArrowRight size={15} color="var(--text-4)" />
                  </div>
                </button>
              </div>
            </div>

            {/* Rewards System Info */}
            <div className="profile-card" style={{ background: 'linear-gradient(145deg, var(--surface-1), var(--surface-2))' }}>
              <div className="profile-card-header">
                <div className="profile-card-title-wrap">
                  <Shield size={18} color="var(--primary-l)" />
                  <h2 className="profile-card-title">Fair Play & Security</h2>
                </div>
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-3)', lineHeight: 1.6 }}>
                Every challenge verification is secured via cryptographic server-side validation. Your gem ledger updates atomically, ensuring balance integrity across sessions.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
