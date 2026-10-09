/**
 * RewardCard.jsx — Displays backend-provided reward after verification.
 * Reward amount comes from response.reward.amount — never computed locally.
 */

import { Gem, CheckCircle, XCircle } from 'lucide-react';
import './RewardCard.css';

export function RewardCard({ result, reward, onClaim, onNoThanks, claiming }) {
  const isCorrect = result === 'CORRECT';

  return (
    <div className={`reward-card reward-card--${isCorrect ? 'correct' : 'wrong'}`}>
      <div className="reward-icon">
        {isCorrect
          ? <CheckCircle size={36} className="icon-correct" />
          : <XCircle   size={36} className="icon-wrong" />}
      </div>

      <h3 className="reward-title">
        {isCorrect ? 'Correct Answer!' : 'Wrong Answer'}
      </h3>

      <div className="reward-gem">
        <Gem size={20} />
        <span>
          +{reward?.amount ?? '?'} {reward?.currency || 'GEM'}
        </span>
      </div>

      <p className="reward-subtitle">
        {isCorrect
          ? 'Reward added to your wallet. Claim to confirm.'
          : 'You still earned a participation reward.'}
      </p>

      <div className="reward-actions">
        <button
          className="btn btn-primary"
          onClick={onClaim}
          disabled={claiming}
          id="btn-claim-reward"
        >
          {claiming ? (
            <><span className="btn-spinner" /> Claiming…</>
          ) : (
            '✓ Claim Reward'
          )}
        </button>
        <button
          className="btn btn-ghost"
          onClick={onNoThanks}
          disabled={claiming}
          id="btn-no-thanks"
        >
          No Thanks →
        </button>
      </div>
    </div>
  );
}
