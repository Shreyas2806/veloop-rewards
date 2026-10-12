/**
 * CaptchaOptions.jsx — 4-option selection grid.
 *
 * States per option: default | selected | correct | wrong | dimmed | disabled.
 * Correctness comes EXCLUSIVELY from the backend response — never computed on the frontend.
 */

import { Check, X, Circle, CheckCircle2, XCircle } from 'lucide-react';
import './CaptchaOptions.css';

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export function CaptchaOptions({
  options = [],
  selected,
  onSelect,
  disabled = false,
  result = null,          // null | 'CORRECT' | 'WRONG'
  verifiedOption = null,  // the option submitted for verification
}) {
  const getState = (opt) => {
    if (!result) {
      if (opt === selected) return 'selected';
      return 'default';
    }
    // Post-verification state
    if (opt === verifiedOption) {
      return result === 'CORRECT' ? 'correct' : 'wrong';
    }
    return 'dimmed';
  };

  return (
    <div className="captcha-options" role="radiogroup" aria-label="CAPTCHA answer choices">
      {options.map((opt, i) => {
        const state = getState(opt);
        const isSelected = opt === selected;

        return (
          <button
            key={i}
            type="button"
            className={`option-btn option-btn--${state}`}
            onClick={() => {
              if (!disabled) onSelect(opt);
            }}
            disabled={disabled}
            aria-label={`Option ${OPTION_LABELS[i]}: ${opt}`}
            aria-checked={isSelected}
            role="radio"
          >
            <div className="option-badge">
              {OPTION_LABELS[i] || i + 1}
            </div>

            <span className="option-text">{opt}</span>

            <div className="option-indicator" aria-hidden="true">
              {state === 'correct' && <CheckCircle2 size={18} className="option-icon option-icon--correct" />}
              {state === 'wrong'   && <XCircle size={18} className="option-icon option-icon--wrong" />}
              {state === 'selected' && <span className="option-dot" />}
              {state === 'default' && <span className="option-empty-dot" />}
            </div>
          </button>
        );
      })}
    </div>
  );
}
