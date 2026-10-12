/**
 * Wallet/index.jsx — Wallet page.
 * Displays balance from GET /wallet/gems and history from GET /wallet/transactions.
 * All data comes from the backend — nothing is computed locally.
 */

import { useState, useEffect, useCallback } from 'react';
import { Gem, ArrowUpRight, Clock, RefreshCw } from 'lucide-react';
import { Navbar } from '../../components/Navbar/Navbar';
import { LoadingState } from '../../components/LoadingState/LoadingState';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { walletService } from '../../services/wallet.service';
import './Wallet.css';

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function Wallet() {
  const [balance, setBalance] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [balRes, txRes] = await Promise.all([
        walletService.getGemBalance(),
        walletService.getTransactions(),
      ]);
      setBalance(balRes.data.balance);
      setTransactions(txRes.data.transactions || []);
    } catch (err) {
      const status = err?.status;
      if (status === 401)      setError('Your session has expired. Please log in again.');
      else if (status === 429) setError('Too many requests. Please wait a moment.');
      else                     setError(err?.message || 'Failed to load wallet data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="wallet-page">
      <Navbar />

      <main className="wallet-main">
        <div className="wallet-container">

          {/* Page header */}
          <div className="wallet-page-header">
            <div className="wallet-page-icon">
              <Gem size={20} />
            </div>
            <div>
              <h1 className="wallet-page-title">Gem Wallet</h1>
              <p className="wallet-page-sub">Your earnings and transaction history</p>
            </div>
          </div>

          {/* Balance hero card */}
          <div className="wallet-balance-card">
            <div className="wallet-balance-header">
              <div className="wallet-balance-inner">
                <div className="wallet-balance-icon">
                  <Gem size={28} />
                </div>
                <div className="wallet-balance-info">
                  <span className="wallet-balance-label">Total Balance</span>
                  <span className="wallet-balance-value">
                    {loading ? '…' : (balance ?? 0)}
                    <span className="wallet-balance-unit">GEM</span>
                  </span>
                  <span className="wallet-balance-sub">
                    {loading ? '' : `${transactions.length} transaction${transactions.length !== 1 ? 's' : ''} total`}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Transactions */}
          <div className="wallet-tx-section">
            <div className="wallet-tx-header">
              <Clock size={15} />
              <h2 className="wallet-tx-title">Transaction History</h2>
              {!loading && transactions.length > 0 && (
                <span className="wallet-tx-count">{transactions.length}</span>
              )}
              <button
                className="btn-icon"
                onClick={() => fetchData(true)}
                disabled={refreshing || loading}
                aria-label="Refresh transactions"
                title="Refresh"
                style={{ marginLeft: 'auto' }}
              >
                <RefreshCw size={14} style={{ animation: refreshing ? 'spin 0.65s linear infinite' : 'none' }} />
              </button>
            </div>

            {loading && <LoadingState message="Loading wallet…" />}
            {!loading && error && <ErrorState message={error} onRetry={() => fetchData()} />}

            {!loading && !error && transactions.length === 0 && (
              <div className="wallet-empty">
                <Gem size={36} className="wallet-empty-icon" />
                <p>No transactions yet.</p>
                <span>Start earning by completing a CAPTCHA challenge.</span>
              </div>
            )}

            {!loading && !error && transactions.length > 0 && (
              <div className="tx-list">
                {transactions.map((tx) => (
                  <div key={tx.transactionId} className="tx-item">
                    <div className="tx-left">
                      <div className="tx-icon">
                        <ArrowUpRight size={15} />
                      </div>
                      <div className="tx-info">
                        <span className="tx-type">{tx.type?.replace(/_/g, ' ')}</span>
                        <span className="tx-date">{formatDate(tx.createdAt)}</span>
                      </div>
                    </div>
                    <div className="tx-amount">
                      <span>+{tx.amount}</span>
                      <span className="tx-currency">{tx.currency || 'GEM'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
