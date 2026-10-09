/**
 * CaptchaCard.jsx — Displays the CAPTCHA text prominently.
 * captchaText comes from the backend. correctOption is NEVER rendered.
 */

import { Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import './CaptchaCard.css';

export function CaptchaCard({ captchaText, expiresAt }) {
  const [secondsLeft, setSecondsLeft] = useState(null);

  useEffect(() => {
    if (!expiresAt) return;
    const calc = () => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt) - Date.now()) / 1000));
      setSecondsLeft(diff);
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const mm = secondsLeft !== null ? String(Math.floor(secondsLeft / 60)).padStart(2, '0') : '--';
  const ss = secondsLeft !== null ? String(secondsLeft % 60).padStart(2, '0') : '--';
  const isExpiring = secondsLeft !== null && secondsLeft <= 20;

  return (
    <div className="captcha-card">
      <div className="captcha-card-header">
        <span className="captcha-label">Type what you see</span>
        {secondsLeft !== null && (
          <div className={`captcha-timer${isExpiring ? ' captcha-timer--warn' : ''}`}>
            <Timer size={13} />
            <span>{mm}:{ss}</span>
          </div>
        )}
      </div>

      <div className="captcha-display">
        {captchaText?.split('').map((ch, i) => (
          <span key={i} className="captcha-char" style={{ '--delay': `${i * 0.05}s` }}>
            {ch}
          </span>
        ))}
      </div>

      <p className="captcha-hint">Select the matching option below</p>
    </div>
  );
}
