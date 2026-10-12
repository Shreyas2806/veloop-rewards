/**
 * CaptchaEarn/index.jsx — Main CAPTCHA earn page.
 *
 * Flow:
 *  LOADING → IDLE (challenge loaded)
 *           → VERIFYING (POST /captcha/verify in flight)
 *           → RESULT (backend returned result + reward)
 *             → CLAIMING (POST /captcha/claim in flight)
 *             → NEXT (load next challenge after claim/no-thanks)
 *
 * The backend is ALWAYS the source of truth.
 * Frontend NEVER computes: correctness, reward, wallet balance, claim state.
 *
 * Session counters (sessionCount, sessionGems) are local-only UI indicators —
 * they do not affect any backend state or reward amounts.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Zap, Gem, Flame } from 'lucide-react';
import { Navbar } from '../../components/Navbar/Navbar';
import { CaptchaCard } from '../../components/CaptchaCard/CaptchaCard';
import { CaptchaOptions } from '../../components/CaptchaOptions/CaptchaOptions';
import { VerificationState } from '../../components/VerificationState/VerificationState';
import { RewardCard } from '../../components/RewardCard/RewardCard';
import { GemBalance } from '../../components/GemBalance/GemBalance';
import { LoadingState } from '../../components/LoadingState/LoadingState';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { SessionRing } from '../../components/SessionRing/SessionRing';
import { captchaService } from '../../services/captcha.service';
import './CaptchaEarn.css';

// ── PHASE constants ────────────────────────────────────────────────────────────
const PHASE = {
  LOADING:   'LOADING',
  IDLE:      'IDLE',
  VERIFYING: 'VERIFYING',
  RESULT:    'RESULT',
  CLAIMING:  'CLAIMING',
  ERROR:     'ERROR',
};

const MILESTONES = { 3: '3 done! On a roll! 🔥', 5: 'Halfway to 10! Keep it up 💎', 10: '10 challenges! Legend! ⚡' };

export default function CaptchaEarn() {
  const [phase, setPhase] = useState(PHASE.LOADING);
  const [challenge, setChallenge] = useState(null);
  const [selected, setSelected] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null); // { result, reward }
  const [errorMsg, setErrorMsg] = useState('');
  const [balanceTick, setBalanceTick] = useState(0);

  // Session-local counters — purely presentational, never sent to backend
  const [sessionCount, setSessionCount] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionGems, setSessionGems] = useState(0);
  const [milestone, setMilestone] = useState(null);
  const milestoneTimer = useRef(null);

  const showMilestone = (count) => {
    if (MILESTONES[count]) {
      setMilestone(MILESTONES[count]);
      clearTimeout(milestoneTimer.current);
      milestoneTimer.current = setTimeout(() => setMilestone(null), 4000);
    }
  };

  // ── Load challenge ─────────────────────────────────────────────────────────
  const loadChallenge = useCallback(async () => {
    setPhase(PHASE.LOADING);
    setSelected(null);
    setVerifyResult(null);
    setErrorMsg('');
    try {
      const res = await captchaService.getCurrentCaptcha();
      setChallenge(res.data.challenge);
      setPhase(PHASE.IDLE);
    } catch (err) {
      const status = err?.status;
      if (status === 401)      setErrorMsg('Your session has expired. Please log in again.');
      else if (status === 429) setErrorMsg('Too many requests. Please wait a moment.');
      else                     setErrorMsg(err?.message || 'Failed to load CAPTCHA. Please try again.');
      setPhase(PHASE.ERROR);
    }
  }, []);

  useEffect(() => { loadChallenge(); }, [loadChallenge]);

  // ── Verify ────────────────────────────────────────────────────────────────
  const handleVerify = async () => {
    if (!selected || phase !== PHASE.IDLE) return;
    setPhase(PHASE.VERIFYING);
    try {
      const res = await captchaService.verifyCaptcha(challenge.challengeId, selected);
      const result = res.data.result;
      const reward = res.data.reward;
      setVerifyResult({ result, reward });
      setBalanceTick((t) => t + 1);
      setPhase(PHASE.RESULT);

      // Update local session counters + persist for Dashboard
      const nextCount = sessionCount + 1;
      setSessionCount(nextCount);
      sessionStorage.setItem('vl_session_count', String(nextCount));
      if (result === 'CORRECT') {
        setSessionCorrect((c) => c + 1);
        setSessionGems((g) => g + (reward?.amount ?? 0));
      }
      showMilestone(nextCount);
    } catch (err) {
      const status = err?.status;
      if (status === 409)      setErrorMsg('This challenge is no longer valid. Loading a new one…');
      else if (status === 410) setErrorMsg('This CAPTCHA has expired. Loading a new one…');
      else if (status === 401) setErrorMsg('Your session has expired. Please log in again.');
      else if (status === 429) setErrorMsg('Too many requests. Please wait a moment.');
      else if (status === 422) setErrorMsg('Invalid submission. Please try again.');
      else                     setErrorMsg(err?.message || 'Verification failed. Please try again.');

      if (status === 409 || status === 410) {
        setTimeout(loadChallenge, 2000);
      }
      setPhase(PHASE.ERROR);
    }
  };

  // ── Claim ─────────────────────────────────────────────────────────────────
  const handleClaim = async () => {
    if (phase !== PHASE.RESULT) return;
    setPhase(PHASE.CLAIMING);
    try {
      await captchaService.claimCaptcha(challenge.challengeId);
      setBalanceTick((t) => t + 1);
      await loadChallenge();
    } catch (err) {
      const status = err?.status;
      if (status === 409) {
        await loadChallenge(); // already claimed — load next
      } else if (status === 429) {
        setErrorMsg('Too many requests. Please wait a moment.');
        setPhase(PHASE.ERROR);
      } else {
        setErrorMsg(err?.message || 'Claim failed. Please try again.');
        setPhase(PHASE.ERROR);
      }
    }
  };

  // ── No Thanks ──────────────────────────────────────────────────────────────
  const handleNoThanks = async () => {
    if (phase !== PHASE.RESULT) return;
    setPhase(PHASE.LOADING);
    try {
      const res = await captchaService.requestNewCaptcha(challenge.challengeId);
      setChallenge(res.data.challenge);
      setSelected(null);
      setVerifyResult(null);
      setPhase(PHASE.IDLE);
    } catch (err) {
      const status = err?.status;
      if (status === 429) setErrorMsg('Too many requests. Please wait a moment.');
      else                setErrorMsg(err?.message || 'Failed to load new CAPTCHA.');
      setPhase(PHASE.ERROR);
    }
  };

  // Card modifier class
  const cardClass = ['earn-card',
    phase === PHASE.IDLE      ? 'earn-card--idle'      : '',
    phase === PHASE.VERIFYING ? 'earn-card--verifying' : '',
    verifyResult?.result === 'CORRECT' && phase === PHASE.RESULT ? 'earn-card--correct' : '',
    verifyResult?.result === 'WRONG'   && phase === PHASE.RESULT ? 'earn-card--wrong'   : '',
  ].filter(Boolean).join(' ');

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="earn-page">
      <Navbar />

      <main className="earn-main">
        <div className="earn-container">

          {/* Header */}
          <div className="earn-header">
            <div className="earn-header-left">
              <div className="earn-header-icon">
                <Zap size={20} />
              </div>
              <div className="earn-header-text">
                <h1 className="earn-title">CAPTCHA Earn</h1>
                <p className="earn-subtitle">Solve challenges · Earn Gems instantly</p>
              </div>
            </div>
            <div className="earn-header-right">
              <SessionRing count={sessionCount} />
              <GemBalance refreshTrigger={balanceTick} />
            </div>
          </div>

          {/* Session stats strip — only after first challenge */}
          {sessionCount > 0 && (
            <div className="earn-stats">
              <div className="earn-stat">
                <span className="earn-stat-value">{sessionCount}</span>
                <span className="earn-stat-label">Played</span>
              </div>
              <div className="earn-stat-sep" />
              <div className="earn-stat earn-stat--correct">
                <span className="earn-stat-value">{sessionCorrect}</span>
                <span className="earn-stat-label">Correct</span>
              </div>
              <div className="earn-stat-sep" />
              <div className="earn-stat earn-stat--gems">
                <span className="earn-stat-value">{sessionGems.toFixed(1)}</span>
                <span className="earn-stat-label">Earned</span>
              </div>
              <div className="earn-stat-sep" />
              <div className="earn-stat">
                <span className="earn-stat-value">
                  {sessionCount > 0 ? Math.round((sessionCorrect / sessionCount) * 100) : 0}%
                </span>
                <span className="earn-stat-label">Accuracy</span>
              </div>
            </div>
          )}

          {/* Milestone toast */}
          {milestone && (
            <div className="earn-milestone" role="status" aria-live="polite">
              <span className="earn-milestone-icon"><Flame size={20} color="#f59e0b" /></span>
              <div className="earn-milestone-text">
                <strong>Milestone!</strong>
                <span>{milestone}</span>
              </div>
            </div>
          )}

          {/* Main card */}
          <div className={cardClass}>
            {/* LOADING */}
            {phase === PHASE.LOADING && <LoadingState message="Loading challenge…" />}

            {/* ERROR */}
            {phase === PHASE.ERROR && <ErrorState message={errorMsg} onRetry={loadChallenge} />}

            {/* IDLE / VERIFYING / RESULT / CLAIMING */}
            {(phase === PHASE.IDLE || phase === PHASE.VERIFYING ||
              phase === PHASE.RESULT || phase === PHASE.CLAIMING) && challenge && (
              <>
                <CaptchaCard
                  captchaText={challenge.captchaText}
                  expiresAt={challenge.expiresAt}
                />

                <div className="earn-divider" />

                {/* Options */}
                {(phase === PHASE.IDLE || phase === PHASE.VERIFYING) && (
                  <CaptchaOptions
                    options={challenge.options}
                    selected={selected}
                    onSelect={setSelected}
                    disabled={phase === PHASE.VERIFYING}
                    result={null}
                    verifiedOption={null}
                  />
                )}

                {/* Result options */}
                {(phase === PHASE.RESULT || phase === PHASE.CLAIMING) && verifyResult && (
                  <CaptchaOptions
                    options={challenge.options}
                    selected={selected}
                    onSelect={() => {}}
                    disabled
                    result={verifyResult.result}
                    verifiedOption={selected}
                  />
                )}

                {/* Verifying animation */}
                {phase === PHASE.VERIFYING && (
                  <div className="earn-verifying">
                    <VerificationState />
                  </div>
                )}

                {/* Verify button */}
                {phase === PHASE.IDLE && (
                  <button
                    id="btn-verify"
                    className="btn btn-primary btn-verify"
                    onClick={handleVerify}
                    disabled={!selected}
                    aria-label="Verify selected answer"
                  >
                    <Gem size={16} />
                    Verify Answer
                  </button>
                )}

                {/* Result + Claim / No Thanks */}
                {phase === PHASE.RESULT && verifyResult && (
                  <RewardCard
                    result={verifyResult.result}
                    reward={verifyResult.reward}
                    onClaim={handleClaim}
                    onNoThanks={handleNoThanks}
                    claiming={false}
                  />
                )}

                {/* Claiming animation */}
                {phase === PHASE.CLAIMING && (
                  <div className="earn-verifying">
                    <LoadingState message="Claiming reward…" />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Skip */}
          {phase === PHASE.IDLE && (
            <div className="earn-skip">
              <button className="btn btn-ghost btn-sm" onClick={loadChallenge} id="btn-skip">
                Skip this challenge →
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
