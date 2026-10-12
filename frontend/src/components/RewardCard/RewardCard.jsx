/**
 * RewardCard.jsx — Displays State 4 (Success) and State 5 (Incorrect).
 * Reward amounts come EXCLUSIVELY from response.reward.amount — never computed locally.
 */

import { Gem, CheckCircle2, XCircle, ArrowRight, RefreshCw } from 'lucide-react';
import './RewardCard.css';

export function RewardCard({
  result,
  reward,
  onClaim,
  onNoThanks,
  claiming = false,
}) {
  const isCorrect = result === 'CORRECT';
  const hasReward = Number(reward?.amount) > 0;

  return (
    <div
      className={`reward-card reward-card--${isCorrect ? 'correct' : 'wrong'}`}
      role="region"
      aria-label={isCorrect ? 'Verification Success' : 'Verification Incorrect'}
    >
      <div className="reward-icon-ring">
        {isCorrect ? (
          <CheckCircle2 size={42} className="icon-correct" />
        ) : (
          <XCircle size={42} className="icon-wrong" />
        )}
      </div>

      <div className="reward-heading-wrap">
        <span className="reward-state-badge">
          {isCorrect ? 'State 4 · Verification Success' : 'State 5 · Incorrect Match'}
        </span>
        <h3 className="reward-title">
          {isCorrect ? 'Challenge Verified Successfully!' : 'Verification Failed'}
        </h3>
      </div>

      {hasReward && (
        <div className="reward-gem-banner">
          <div className="reward-gem-icon">
            <Gem size={22} />
          </div>
          <div className="reward-gem-details">
            <span className="reward-gem-label">
              {isCorrect ? 'Earned Reward' : 'Participation Credit'}
            </span>
            <span className="reward-gem-val">
              +{reward?.amount} {reward?.currency || 'GEM'}
            </span>
          </div>
        </div>
      )}

      <p className="reward-subtitle">
        {isCorrect
          ? 'Your answer matched the server challenge proof. Claim to deposit gems into your wallet.'
          : hasReward
          ? 'Selected code did not match the target, but you received participation gems. Claim or start a new challenge.'
          : 'Selected code did not match the target challenge. Load a new code to continue earning.'}
      </p>

      <div className="reward-actions">
        {hasReward ? (
          <>
            <button
              id="btn-claim-reward"
              type="button"
              className={`btn btn-primary btn-claim${!isCorrect ? ' btn-claim--participation' : ''}`}
              onClick={onClaim}
              disabled={claiming}
            >
              {claiming ? (
                <>
                  <span className="btn-spinner" /> Claiming…
                </>
              ) : (
                `✓ Claim ${isCorrect ? 'Reward' : 'Credit'}`
              )}
            </button>
            <button
              id="btn-no-thanks"
              type="button"
              className="btn btn-ghost"
              onClick={onNoThanks}
              disabled={claiming}
            >
              <RefreshCw size={14} />
              <span>{isCorrect ? 'No Thanks →' : 'Get New Code'}</span>
            </button>
          </>
        ) : (
          <button
            id="btn-next-challenge"
            type="button"
            className="btn btn-primary"
            onClick={onNoThanks}
            disabled={claiming}
          >
            <RefreshCw size={15} />
            <span>Get New Code</span>
            <ArrowRight size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
