/**
 * CaptchaOptions.jsx — 4-option grid.
 *
 * States per option: default / selected / correct / wrong / disabled.
 * Correctness comes EXCLUSIVELY from backend result — never computed here.
 */

import { Check, X } from 'lucide-react';
import './CaptchaOptions.css';

export function CaptchaOptions({
  options = [],
  selected,
  onSelect,
  disabled = false,
  result = null,       // null | 'CORRECT' | 'WRONG'  (from backend)
  verifiedOption = null, // the option that was submitted
}) {
  const getState = (opt) => {
    if (!result) {
      if (opt === selected) return 'selected';
      return 'default';
    }
    // Post-verification states — backend tells us result, not correctness per-option
    if (opt === verifiedOption) {
      return result === 'CORRECT' ? 'correct' : 'wrong';
    }
    return 'dimmed';
  };

  return (
    <div className="captcha-options">
      {options.map((opt, i) => {
        const state = getState(opt);
        return (
          <button
            key={i}
            className={`option-btn option-btn--${state}`}
            onClick={() => !disabled && onSelect(opt)}
            disabled={disabled}
            aria-label={`Option: ${opt}`}
            aria-pressed={opt === selected}
          >
            <span className="option-text">{opt}</span>
            {state === 'correct' && <Check size={16} className="option-icon" />}
            {state === 'wrong'   && <X    size={16} className="option-icon" />}
          </button>
        );
      })}
    </div>
  );
}
