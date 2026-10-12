/**
 * CaptchaEarn/index.jsx — VELoop Rewards CAPTCHA Earn Flow.
 *
 * Implements the 5-state lifecycle from the design specification:
 *   State 1 — Challenge: Display CAPTCHA & unselected options
 *   State 2 — Option Selected: Highlight option & enable Submit Answer
 *   State 3 — Verifying: Centered violet indicator with lock icon & locked input
 *   State 4 — Success: Green indicator, backend reward, Claim & No Thanks
 *   State 5 — Incorrect: Red indicator, explanation, Get New Code action
 *
 * Guarantees:
 *   - Strictly single-pass submission (synchronous ref locks).
 *   - Server-authoritative results and rewards.
 *   - Zero client-side computation of answers or rewards.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap, Gem, ArrowLeft, RefreshCw, Flame, CheckCircle2,
  XCircle, Lock, ShieldCheck, Award, Info, Sparkles, ChevronRight
} from 'lucide-react';
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

// ── State phases ─────────────────────────────────────────────────────────────
const PHASE = {
  LOADING:   'LOADING',
  IDLE:      'IDLE',
  VERIFYING: 'VERIFYING',
  RESULT:    'RESULT',
  CLAIMING:  'CLAIMING',
  ERROR:     'ERROR',
};

// ── 5 Stepper Steps from Specification ───────────────────────────────────────
const FLOW_STEPS = [
  { id: 1, label: 'Challenge' },
  { id: 2, label: 'Option Selected' },
  { id: 3, label: 'Verifying' },
  { id: 4, label: 'Success' },
  { id: 5, label: 'Incorrect' },
];

const MILESTONES = {
  3: '3 in a row! Momentum building 🔥',
  5: '5 challenges completed! Keep earning 💎',
  10: '10 challenges reached! Top earner ⚡',
};

// ── Web Audio Feedback Helper ────────────────────────────────────────────────
const playFeedbackSound = (type) => {
  try {
    if (localStorage.getItem('vl_pref_sound') === 'false') return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'correct') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else if (type === 'wrong') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch {
    // Graceful fallback if audio is not permitted
  }
};

export default function CaptchaEarn() {
  const navigate = useNavigate();

  const [phase, setPhase] = useState(PHASE.LOADING);
  const [challenge, setChallenge] = useState(null);
  const [selected, setSelected] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null); // { result, reward }
  const [errorMsg, setErrorMsg] = useState('');
  const [balanceTick, setBalanceTick] = useState(0);

  // Session-local counters (presentational only)
  const [sessionCount, setSessionCount] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionGems, setSessionGems] = useState(0);
  const [milestone, setMilestone] = useState(null);
  const milestoneTimer = useRef(null);

  // Synchronous locks to physically block double-clicks and concurrent calls
  const isVerifyingRef = useRef(false);
  const isClaimingRef = useRef(false);
  const isSkippingRef = useRef(false);
  const isLoadingRef = useRef(false);
  const submittedChallengeIdRef = useRef(null);

  const showMilestone = (count) => {
    if (MILESTONES[count]) {
      setMilestone(MILESTONES[count]);
      clearTimeout(milestoneTimer.current);
      milestoneTimer.current = setTimeout(() => setMilestone(null), 4000);
    }
  };

  // ── Load Current Challenge ──────────────────────────────────────────────────
  const loadChallenge = useCallback(async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    setPhase(PHASE.LOADING);
    setSelected(null);
    setVerifyResult(null);
    setErrorMsg('');

    try {
      const res = await captchaService.getCurrentCaptcha();
      setChallenge(res.data.challenge);
      // Reset submission guards exclusively for the new challenge
      isVerifyingRef.current = false;
      submittedChallengeIdRef.current = null;
      setPhase(PHASE.IDLE);
    } catch (err) {
      isVerifyingRef.current = false;
      const status = err?.status;
      if (status === 401)      setErrorMsg('Your session has expired. Please log in again.');
      else if (status === 429) setErrorMsg('Too many requests. Please wait a moment.');
      else                     setErrorMsg(err?.message || 'Failed to load CAPTCHA. Please try again.');
      setPhase(PHASE.ERROR);
    } finally {
      isLoadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadChallenge();
    return () => {
      clearTimeout(milestoneTimer.current);
    };
  }, [loadChallenge]);

  // ── Verify Challenge (Single Submission Guarded) ────────────────────────────
  const handleVerify = async () => {
    if (isVerifyingRef.current) return;
    if (!selected || phase !== PHASE.IDLE) return;
    if (!challenge?.challengeId) return;
    if (submittedChallengeIdRef.current === challenge.challengeId) return;

    // Lock synchronously
    isVerifyingRef.current = true;
    submittedChallengeIdRef.current = challenge.challengeId;
    setPhase(PHASE.VERIFYING);

    try {
      const res = await captchaService.verifyCaptcha(challenge.challengeId, selected);
      const result = res.data.result;
      const reward = res.data.reward;

      setVerifyResult({ result, reward });
      setBalanceTick((t) => t + 1);
      setPhase(PHASE.RESULT);

      playFeedbackSound(result === 'CORRECT' ? 'correct' : 'wrong');

      const nextCount = sessionCount + 1;
      setSessionCount(nextCount);
      sessionStorage.setItem('vl_session_count', String(nextCount));

      if (result === 'CORRECT') {
        setSessionCorrect((c) => c + 1);
        setSessionGems((g) => g + (reward?.amount ?? 0));
      }
      showMilestone(nextCount);
    } catch (err) {
      isVerifyingRef.current = false;
      const status = err?.status;

      if (status === 409) {
        setErrorMsg('This challenge is no longer valid. Loading next challenge…');
        setTimeout(loadChallenge, 1500);
      } else if (status === 410) {
        setErrorMsg('This challenge has expired. Loading next challenge…');
        setTimeout(loadChallenge, 1500);
      } else if (status === 401) {
        setErrorMsg('Your session has expired. Please log in again.');
      } else if (status === 429) {
        setErrorMsg('Rate limit reached. Please wait a moment.');
      } else if (status === 422) {
        setErrorMsg('Invalid selection. Please choose an option and try again.');
        submittedChallengeIdRef.current = null;
        setPhase(PHASE.IDLE);
        return;
      } else {
        setErrorMsg(err?.message || 'Verification failed. Please try again.');
      }
      setPhase(PHASE.ERROR);
    }
  };

  // ── Claim Reward (State 4 / 5 Claim) ─────────────────────────────────────────
  const handleClaim = async () => {
    if (isClaimingRef.current || phase !== PHASE.RESULT) return;
    if (!challenge?.challengeId) return;

    isClaimingRef.current = true;
    setPhase(PHASE.CLAIMING);

    try {
      await captchaService.claimCaptcha(challenge.challengeId);
      setBalanceTick((t) => t + 1);

      // Smoothly transition to the next challenge
      const res = await captchaService.requestNewCaptcha(challenge.challengeId);
      setChallenge(res.data.challenge);
      setSelected(null);
      setVerifyResult(null);
      isVerifyingRef.current = false;
      submittedChallengeIdRef.current = null;
      setPhase(PHASE.IDLE);
    } catch (err) {
      const status = err?.status;
      if (status === 409) {
        await loadChallenge();
      } else if (status === 429) {
        setErrorMsg('Too many requests. Please wait a moment.');
        setPhase(PHASE.ERROR);
      } else {
        setErrorMsg(err?.message || 'Claim failed. Please try again.');
        setPhase(PHASE.ERROR);
      }
    } finally {
      isClaimingRef.current = false;
    }
  };

  // ── No Thanks / Get New Code ────────────────────────────────────────────────
  const handleNoThanks = async () => {
    if (isSkippingRef.current || phase !== PHASE.RESULT) return;
    isSkippingRef.current = true;
    setPhase(PHASE.LOADING);

    try {
      const res = await captchaService.requestNewCaptcha(challenge?.challengeId);
      setChallenge(res.data.challenge);
      setSelected(null);
      setVerifyResult(null);
      isVerifyingRef.current = false;
      submittedChallengeIdRef.current = null;
      setPhase(PHASE.IDLE);
    } catch (err) {
      const status = err?.status;
      if (status === 429) setErrorMsg('Too many requests. Please wait a moment.');
      else                setErrorMsg(err?.message || 'Failed to load next challenge.');
      setPhase(PHASE.ERROR);
    } finally {
      isSkippingRef.current = false;
    }
  };

  // ── Skip Active Challenge ───────────────────────────────────────────────────
  const handleSkipActive = async () => {
    if (isLoadingRef.current || phase !== PHASE.IDLE) return;
    setPhase(PHASE.LOADING);

    try {
      const res = await captchaService.requestNewCaptcha(challenge?.challengeId);
      setChallenge(res.data.challenge);
      setSelected(null);
      setVerifyResult(null);
      isVerifyingRef.current = false;
      submittedChallengeIdRef.current = null;
      setPhase(PHASE.IDLE);
    } catch {
      loadChallenge();
    }
  };

  // ── Determine Current Active Step (1–5) for Progress Indicator ──────────────
  const getActiveStep = () => {
    if (phase === PHASE.LOADING) return 1;
    if (phase === PHASE.IDLE) {
      return selected ? 2 : 1;
    }
    if (phase === PHASE.VERIFYING) return 3;
    if (phase === PHASE.RESULT || phase === PHASE.CLAIMING) {
      return verifyResult?.result === 'CORRECT' ? 4 : 5;
    }
    return 1;
  };

  const activeStep = getActiveStep();

  // Dynamic Card Modifier
  const cardModifier = [
    'earn-card',
    phase === PHASE.IDLE && !selected ? 'earn-card--step1' : '',
    phase === PHASE.IDLE && selected  ? 'earn-card--step2' : '',
    phase === PHASE.VERIFYING         ? 'earn-card--step3' : '',
    verifyResult?.result === 'CORRECT' && (phase === PHASE.RESULT || phase === PHASE.CLAIMING) ? 'earn-card--step4' : '',
    verifyResult?.result === 'WRONG'   && (phase === PHASE.RESULT || phase === PHASE.CLAIMING) ? 'earn-card--step5' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="earn-page">
      <Navbar />

      <main className="earn-main">
        <div className="earn-container">

          {/* Subheader Navigation */}
          <div className="earn-subnav">
            <button
              className="earn-back-btn"
              onClick={() => navigate('/dashboard')}
              aria-label="Back to Dashboard"
            >
              <ArrowLeft size={15} />
              <span>Dashboard</span>
            </button>

            <div className="earn-brand-badge">
              <Zap size={14} className="earn-brand-bolt" />
              <span>VELoop Rewards · Verification Node</span>
            </div>
          </div>

          {/* Page Header (Specification: CAPTCHA EARN FLOW) */}
          <div className="earn-flow-header">
            <div className="earn-flow-title-wrap">
              <span className="earn-flow-tag">Cryptographic Proof-of-Work</span>
              <h1 className="earn-flow-title">CAPTCHA EARN FLOW</h1>
              <p className="earn-flow-subtitle">
                Complete single-pass cryptographic challenges to earn verified Gem rewards
              </p>
            </div>

            <div className="earn-flow-header-stats">
              <SessionRing count={sessionCount} />
              <GemBalance refreshTrigger={balanceTick} />
            </div>
          </div>

          {/* ── 5-State Progress Indicator ──────────────────────────────────── */}
          <div className="flow-stepper" aria-label="Verification progress">
            <div className="flow-stepper-track">
              {FLOW_STEPS.map((step) => {
                const isStepActive = activeStep === step.id;
                const isStepCompleted =
                  (activeStep === 2 && step.id === 1) ||
                  (activeStep === 3 && step.id <= 2) ||
                  (activeStep === 4 && step.id <= 3) ||
                  (activeStep === 5 && step.id <= 3);

                let stepClass = 'stepper-node';
                if (isStepActive) {
                  stepClass += ` stepper-node--active stepper-node--step${step.id}`;
                } else if (isStepCompleted) {
                  stepClass += ' stepper-node--completed';
                }

                return (
                  <div key={step.id} className={stepClass}>
                    <div className="stepper-circle">
                      {isStepCompleted && step.id <= 3 ? (
                        <CheckCircle2 size={13} />
                      ) : (
                        <span>{step.id}</span>
                      )}
                    </div>
                    <span className="stepper-label">{step.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Session Metrics Bar (Shown after first challenge) */}
          {sessionCount > 0 && (
            <div className="earn-stats" aria-label="Session statistics">
              <div className="earn-stat">
                <span className="earn-stat-value">{sessionCount}</span>
                <span className="earn-stat-label">Solved</span>
              </div>
              <div className="earn-stat-sep" />
              <div className="earn-stat earn-stat--correct">
                <span className="earn-stat-value">{sessionCorrect}</span>
                <span className="earn-stat-label">Correct</span>
              </div>
              <div className="earn-stat-sep" />
              <div className="earn-stat earn-stat--gems">
                <span className="earn-stat-value">+{sessionGems.toFixed(1)}</span>
                <span className="earn-stat-label">Gems</span>
              </div>
              <div className="earn-stat-sep" />
              <div className="earn-stat">
                <span className="earn-stat-value">
                  {Math.round((sessionCorrect / sessionCount) * 100)}%
                </span>
                <span className="earn-stat-label">Accuracy</span>
              </div>
            </div>
          )}

          {/* Milestone Toast */}
          {milestone && (
            <div className="earn-milestone" role="status" aria-live="polite">
              <span className="earn-milestone-icon">
                <Flame size={20} color="#f59e0b" />
              </span>
              <div className="earn-milestone-text">
                <strong>Milestone Reached!</strong>
                <span>{milestone}</span>
              </div>
            </div>
          )}

          {/* ── Primary CAPTCHA Card ────────────────────────────────────────── */}
          <div className={cardModifier}>
            {/* Loading Phase */}
            {phase === PHASE.LOADING && (
              <LoadingState message="Fetching encrypted challenge from server…" />
            )}

            {/* Error Phase */}
            {phase === PHASE.ERROR && (
              <ErrorState message={errorMsg} onRetry={loadChallenge} />
            )}

            {/* Interactive Phases (States 1, 2, 3, 4, 5) */}
            {(phase === PHASE.IDLE || phase === PHASE.VERIFYING ||
              phase === PHASE.RESULT || phase === PHASE.CLAIMING) && challenge && (
              <>
                {/* Visual Challenge Box */}
                <CaptchaCard
                  captchaText={challenge.captchaText}
                  expiresAt={challenge.expiresAt}
                />

                {/* State 1 & 2: Challenge & Option Selection Grid */}
                {(phase === PHASE.IDLE || phase === PHASE.VERIFYING) && (
                  <>
                    <div className="earn-divider">
                      <span className="earn-divider-text">
                        {selected ? 'State 2 · Option Selected' : 'State 1 · Select Matching Code'}
                      </span>
                    </div>

                    <CaptchaOptions
                      options={challenge.options}
                      selected={selected}
                      onSelect={setSelected}
                      disabled={phase === PHASE.VERIFYING}
                      result={null}
                      verifiedOption={null}
                    />

                    {/* State 3: Verifying Spinner Overlay */}
                    {phase === PHASE.VERIFYING && (
                      <div className="earn-verifying-panel">
                        <VerificationState />
                      </div>
                    )}

                    {/* State 1 / State 2 Action Button */}
                    {phase === PHASE.IDLE && (
                      <div className="earn-action-wrap">
                        <button
                          id="btn-verify"
                          type="button"
                          className={`btn btn-primary btn-xl btn-verify${!selected ? ' btn-verify--disabled' : ''}`}
                          onClick={handleVerify}
                          disabled={!selected}
                          aria-label="Submit Answer"
                        >
                          <Gem size={18} />
                          <span>{selected ? 'Verify Answer' : 'Select an Option Above'}</span>
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* State 4 (Success) & State 5 (Incorrect) */}
                {(phase === PHASE.RESULT || phase === PHASE.CLAIMING) && verifyResult && (
                  <>
                    <div className="earn-divider">
                      <span className="earn-divider-text">
                        {verifyResult.result === 'CORRECT' ? 'State 4 · Verification Result' : 'State 5 · Verification Result'}
                      </span>
                    </div>

                    {/* Options displayed in verified state */}
                    <CaptchaOptions
                      options={challenge.options}
                      selected={selected}
                      onSelect={() => {}}
                      disabled
                      result={verifyResult.result}
                      verifiedOption={selected}
                    />

                    <RewardCard
                      result={verifyResult.result}
                      reward={verifyResult.reward}
                      onClaim={handleClaim}
                      onNoThanks={handleNoThanks}
                      claiming={phase === PHASE.CLAIMING}
                    />
                  </>
                )}
              </>
            )}
          </div>

          {/* Secondary Skip Action (Active only during State 1 / 2) */}
          {phase === PHASE.IDLE && (
            <div className="earn-skip">
              <button
                id="btn-skip"
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleSkipActive}
              >
                <RefreshCw size={14} />
                <span>Skip this challenge</span>
              </button>
            </div>
          )}

          {/* ── Reward Information Card & Security Notice ─────────────────── */}
          <div className="earn-info-strip">
            {/* Reward Information Card */}
            <div className="earn-reward-info-card">
              <div className="earn-info-card-header">
                <Award size={18} className="earn-info-icon" />
                <h3 className="earn-info-title">Configured Reward</h3>
              </div>
              <div className="earn-reward-matrix">
                <div className="earn-reward-row">
                  <span className="earn-reward-type">Exact Match (Correct)</span>
                  <span className="earn-reward-val earn-reward-val--green">+1.0 GEM</span>
                </div>
                <div className="earn-reward-row">
                  <span className="earn-reward-type">Participation Credit</span>
                  <span className="earn-reward-val earn-reward-val--amber">+0.5 GEM</span>
                </div>
              </div>
            </div>

            {/* Compact Security Notice */}
            <div className="earn-security-card">
              <div className="earn-info-card-header">
                <ShieldCheck size={18} className="earn-security-icon" />
                <h3 className="earn-info-title">Security Notice</h3>
              </div>
              <p className="earn-security-desc">
                Each challenge is single-use, timestamped, and cryptographically verified on the backend. Double submissions and simulated responses are strictly prohibited.
              </p>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
