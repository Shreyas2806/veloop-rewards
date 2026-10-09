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

  const fetchBalance = useCallback(async () => {
    try {
      const res = await walletService.getGemBalance();
      setBalance(res.data.balance);
    } catch {
      // silently keep last known balance if refresh fails
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance, refreshTrigger]);

  if (compact) {
    return (
      <div className="gem-badge">
        <Gem size={14} className="gem-icon" />
        <span>{loading ? '—' : `${balance ?? 0} Gems`}</span>
      </div>
    );
  }

  return (
    <div className="gem-balance-card">
      <div className="gem-balance-icon">
        <Gem size={28} />
      </div>
      <div className="gem-balance-info">
        <span className="gem-balance-label">Gem Balance</span>
        <span className="gem-balance-value">
          {loading ? '…' : `${balance ?? 0}`}
          <span className="gem-balance-unit"> GEM</span>
        </span>
      </div>
    </div>
  );
}
