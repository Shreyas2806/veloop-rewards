/**
 * VerificationState.jsx — Animated verification indicator with a lock icon.
 * Displayed while POST /captcha/verify is in flight.
 */

import { Lock, ShieldCheck } from 'lucide-react';
import './VerificationState.css';

export function VerificationState() {
  return (
    <div className="verification-state" role="status" aria-live="polite">
      <div className="verification-orb-wrap">
        <div className="verification-orb">
          <div className="verification-orb-spin" />
          <div className="verification-orb-glow" />
          <div className="verification-lock-icon">
            <Lock size={22} />
          </div>
        </div>
      </div>

      <div className="verification-text">
        <h4 className="verification-label">Verifying Signature…</h4>
        <p className="verification-sub">Validating single-pass proof with backend server</p>
      </div>

      <div className="verification-progress-bar">
        <div className="verification-progress-fill" />
      </div>
    </div>
  );
}
