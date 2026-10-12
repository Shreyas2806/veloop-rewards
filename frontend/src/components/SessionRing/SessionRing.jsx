/**
 * SessionRing.jsx — Visual session progress indicator.
 * Tracks how many challenges completed this session (local count only).
 * Shows a circular progress ring and milestone feedback.
 * No fake data — counts actual completions from real verify calls.
 */

import './SessionRing.css';

const MILESTONES = [3, 5, 10];
const MAX_DISPLAY = 10;

export function SessionRing({ count = 0 }) {
  const pct = Math.min(count / MAX_DISPLAY, 1);
  const circumference = 2 * Math.PI * 20; // r=20
  const offset = circumference * (1 - pct);

  const nextMilestone = MILESTONES.find((m) => m > count) ?? null;
  const lastMilestone = MILESTONES.filter((m) => m <= count).pop() ?? null;
  const isMilestone = MILESTONES.includes(count);

  return (
    <div className={`session-ring${isMilestone ? ' session-ring--milestone' : ''}`} aria-label={`Session progress: ${count} challenge${count !== 1 ? 's' : ''} completed`}>
      {/* SVG progress ring */}
      <svg className="session-ring-svg" width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
        {/* Track */}
        <circle
          cx="28" cy="28" r="20"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="3.5"
        />
        {/* Progress arc */}
        <circle
          cx="28" cy="28" r="20"
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 28 28)"
          className="session-ring-arc"
        />
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
      </svg>
      {/* Center count */}
      <div className="session-ring-center">
        <span className="session-ring-count">{count}</span>
      </div>
      {/* Label below ring */}
      <div className="session-ring-meta">
        <span className="session-ring-label">Session</span>
        {nextMilestone && count > 0 && (
          <span className="session-ring-next">{nextMilestone - count} to go</span>
        )}
      </div>
    </div>
  );
}
