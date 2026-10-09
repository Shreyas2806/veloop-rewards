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
 */

import { useState, useEffect, useCallback } from 'react';
import { Zap } from 'lucide-react';
import { Navbar } from '../../components/Navbar/Navbar';
import { CaptchaCard } from '../../components/CaptchaCard/CaptchaCard';
import { CaptchaOptions } from '../../components/CaptchaOptions/CaptchaOptions';
import { VerificationState } from '../../components/VerificationState/VerificationState';
import { RewardCard } from '../../components/RewardCard/RewardCard';
import { GemBalance } from '../../components/GemBalance/GemBalance';
import { LoadingState } from '../../components/LoadingState/LoadingState';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { captchaService } from '../../services/captcha.service';
import './CaptchaEarn.css';

// ── PHASE constants ────────────────────────────────────────────────────────────
const PHASE = {
  LOADING:    'LOADING',
  IDLE:       'IDLE',
  VERIFYING:  'VERIFYING',
  RESULT:     'RESULT',
  CLAIMING:   'CLAIMING',
  ERROR:      'ERROR',
};

export default function CaptchaEarn() {
  const [phase, setPhase] = useState(PHASE.LOADING);
  const [challenge, setChallenge] = useState(null);
  const [selected, setSelected] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null); // { result, reward }
  const [errorMsg, setErrorMsg] = useState('');
  const [balanceTick, setBalanceTick] = useState(0); // increments to trigger GemBalance refresh

  // ── Load challenge ────────────────────────────────────────────────────────────
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
      if (status === 401) setErrorMsg('Your session has expired. Please log in again.');
      else if (status === 429) setErrorMsg('Too many requests. Please wait a moment.');
      else setErrorMsg(err?.message || 'Failed to load CAPTCHA. Please try again.');
      setPhase(PHASE.ERROR);
    }
  }, []);

  useEffect(() => { loadChallenge(); }, [loadChallenge]);

  // ── Verify ───────────────────────────────────────────────────────────────────
  const handleVerify = async () => {
    if (!selected || phase !== PHASE.IDLE) return;
    setPhase(PHASE.VERIFYING);
    try {
      const res = await captchaService.verifyCaptcha(challenge.challengeId, selected);
      setVerifyResult({ result: res.data.result, reward: res.data.reward });
      setBalanceTick((t) => t + 1); // reward was applied — refresh balance
      setPhase(PHASE.RESULT);
    } catch (err) {
      const status = err?.status;
      if (status === 409)      setErrorMsg('This challenge is no longer valid. Loading a new one…');
      else if (status === 410) setErrorMsg('This CAPTCHA has expired. Loading a new one…');
      else if (status === 401) setErrorMsg('Your session has expired. Please log in again.');
      else if (status === 429) setErrorMsg('Too many requests. Please wait a moment.');
      else if (status === 422) setErrorMsg('Invalid submission. Please try again.');
      else                     setErrorMsg(err?.message || 'Verification failed. Please try again.');

      // If 409/410 → auto-load a fresh challenge
      if (status === 409 || status === 410) {
        setTimeout(loadChallenge, 2000);
        setPhase(PHASE.ERROR);
      } else {
        setPhase(PHASE.ERROR);
      }
    }
  };

  // ── Claim ─────────────────────────────────────────────────────────────────────
  const handleClaim = async () => {
    if (phase !== PHASE.RESULT) return;
    setPhase(PHASE.CLAIMING);
    try {
      await captchaService.claimCaptcha(challenge.challengeId);
      setBalanceTick((t) => t + 1);
      // Load next challenge
      await loadChallenge();
    } catch (err) {
      const status = err?.status;
      if (status === 409) {
        // Already claimed — still load next challenge
        await loadChallenge();
      } else if (status === 429) {
        setErrorMsg('Too many requests. Please wait a moment.');
        setPhase(PHASE.ERROR);
      } else {
        setErrorMsg(err?.message || 'Claim failed. Please try again.');
        setPhase(PHASE.ERROR);
      }
    }
  };

  // ── No Thanks ─────────────────────────────────────────────────────────────────
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
      else setErrorMsg(err?.message || 'Failed to load new CAPTCHA.');
      setPhase(PHASE.ERROR);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="earn-page">
      <Navbar />

      <main className="earn-main">
        <div className="earn-container">
          {/* Header */}
          <div className="earn-header">
            <div className="earn-header-icon">
              <Zap size={22} />
            </div>
            <div>
              <h1 className="earn-title">CAPTCHA Earn</h1>
              <p className="earn-subtitle">Solve challenges and earn Gems instantly</p>
            </div>
            <div className="earn-header-balance">
              <GemBalance refreshTrigger={balanceTick} />
            </div>
          </div>

          {/* Main card */}
          <div className="earn-card">

            {/* LOADING */}
            {phase === PHASE.LOADING && (
              <LoadingState message="Loading challenge…" />
            )}

            {/* ERROR */}
            {phase === PHASE.ERROR && (
              <ErrorState message={errorMsg} onRetry={loadChallenge} />
            )}

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

                {/* Result options (show selected/correct/wrong state) */}
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

                {/* VERIFYING animation */}
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

                {/* CLAIMING animation */}
                {phase === PHASE.CLAIMING && (
                  <div className="earn-verifying">
                    <LoadingState message="Claiming reward…" />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Skip — always visible when in IDLE */}
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
