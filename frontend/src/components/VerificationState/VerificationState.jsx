/**
 * VerificationState.jsx — Animated state shown while POST /captcha/verify is in flight.
 */

import './VerificationState.css';

export function VerificationState() {
  return (
    <div className="verifying">
      <div className="verifying-ring">
        <div className="verifying-dot" />
        <div className="verifying-dot" />
        <div className="verifying-dot" />
      </div>
      <p className="verifying-label">Verifying your answer…</p>
    </div>
  );
}
