/**
 * ProtectedRoute.jsx
 * Redirects unauthenticated users to /login.
 * Redirects already-authenticated users away from /login & /register.
 */

import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="full-loading"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="full-loading"><div className="spinner" /></div>;
  if (user) return <Navigate to="/captcha" replace />;
  return children;
}
