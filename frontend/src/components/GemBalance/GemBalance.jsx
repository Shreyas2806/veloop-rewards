/**
 * GemBalance.jsx
 * Fetches balance from GET /wallet/gems and displays it.
 * Balance is NEVER taken from local state as authoritative.
 */

import { useState, useEffect, useCallback } from 'react';
import { Gem } from 'lucide-react';
import { walletService } from '../../services/wallet.service';
import './GemBalance.css';

export function GemBalance({ compact = false, refreshTrigger = 0 }) {
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [prev, setPrev] = useState(null);
  const [bump, setBump] = useState(false);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await walletService.getGemBalance();
      const newBal = res.data.balance;
      setPrev((p) => {
        if (p !== null && newBal !== p) setBump(true);
        return newBal;
      });
      setBalance(newBal);
    } catch {
      // silently keep last known balance if refresh fails
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBalance(); }, [fetchBalance, refreshTrigger]);

  useEffect(() => {
    if (!bump) return;
    const t = setTimeout(() => setBump(false), 600);
    return () => clearTimeout(t);
  }, [bump]);

  if (compact) {
    return (
      <div className={`gem-badge${bump ? ' gem-badge--bump' : ''}`}>
        <Gem size={13} className="gem-icon" />
        <span>{loading ? '—' : `${balance ?? 0} Gems`}</span>
      </div>
    );
  }

  return (
    <div className="gem-balance-card">
      <div className="gem-balance-icon">
        <Gem size={26} />
      </div>
      <div className="gem-balance-info">
        <span className="gem-balance-label">Gem Balance</span>
        <span className={`gem-balance-value${bump ? ' gem-balance-value--bump' : ''}`}>
          {loading ? '…' : `${balance ?? 0}`}
          <span className="gem-balance-unit"> GEM</span>
        </span>
      </div>
    </div>
  );
}
