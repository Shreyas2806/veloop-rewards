/**
 * VerificationState.jsx — Animated state shown while POST /captcha/verify is in flight.
 */

import './VerificationState.css';

export function VerificationState() {
  return (
    <div className="verification-state">
      <div className="verification-orb">
        <div className="verification-orb-inner" />
        <div className="verification-orb-glow" />
      </div>
      <div className="verification-text">
        <span className="verification-label">Verifying your answer…</span>
        <span className="verification-sub">Checking with the server</span>
      </div>
    </div>
  );
}
