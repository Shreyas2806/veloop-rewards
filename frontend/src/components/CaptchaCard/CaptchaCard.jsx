/**
 * CaptchaCard.jsx — Displays the CAPTCHA text challenge prominently.
 * captchaText comes from the backend. correctOption is NEVER rendered.
 */

import { Timer, ShieldCheck, AlertTriangle } from 'lucide-react';
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
  const isExpiring = secondsLeft !== null && secondsLeft <= 20 && secondsLeft > 0;
  const isExpired = secondsLeft === 0;

  return (
    <div className="captcha-card">
      <div className="captcha-card-header">
        <div className="captcha-badge">
          <ShieldCheck size={14} className="captcha-badge-icon" />
          <span>Security Challenge</span>
        </div>

        {secondsLeft !== null && (
          <div
            className={`captcha-timer${isExpiring ? ' captcha-timer--warn' : ''}${isExpired ? ' captcha-timer--expired' : ''}`}
            title={isExpired ? 'Challenge expired' : `${secondsLeft} seconds remaining`}
          >
            {isExpired ? <AlertTriangle size={13} /> : <Timer size={13} />}
            <span>{isExpired ? 'EXPIRED' : `${mm}:${ss}`}</span>
          </div>
        )}
      </div>

      <div className="captcha-display-frame">
        <div className="captcha-scanline" aria-hidden="true" />
        <div className="captcha-display" aria-label={`CAPTCHA challenge text`}>
          {captchaText?.split('').map((ch, i) => (
            <span
              key={i}
              className="captcha-char"
              style={{ '--delay': `${i * 0.05}s` }}
            >
              {ch}
            </span>
          ))}
        </div>
        <div className="captcha-watermark" aria-hidden="true">VELOOP SECURE PROTOCOL</div>
      </div>

      <p className="captcha-hint">
        Review the code above and select the identical match below.
      </p>
    </div>
  );
}
