/**
 * ErrorState.jsx — Consistent error display with retry support.
 */

import { AlertTriangle, RefreshCw } from 'lucide-react';
import './ErrorState.css';

export function ErrorState({ message, onRetry }) {
  return (
    <div className="error-state">
      <AlertTriangle size={32} className="error-icon" />
      <p className="error-message">{message || 'Something went wrong.'}</p>
      {onRetry && (
        <button className="btn btn-ghost btn-sm" onClick={onRetry}>
          <RefreshCw size={14} /> Try Again
        </button>
      )}
    </div>
  );
}
