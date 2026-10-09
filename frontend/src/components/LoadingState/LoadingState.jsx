/**
 * LoadingState.jsx — Generic loading placeholder.
 */

import './LoadingState.css';

export function LoadingState({ message = 'Loading…' }) {
  return (
    <div className="loading-state">
      <div className="loading-spinner" />
      <p className="loading-message">{message}</p>
    </div>
  );
}
