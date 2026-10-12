/**
 * App.jsx — Root router. Defines all routes.
 *
 * Protected routes: /dashboard, /captcha, /wallet — redirect to /login if not authenticated.
 * Public routes: /login, /register — redirect to /dashboard if already authenticated.
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute, PublicRoute } from './components/ProtectedRoute/ProtectedRoute';

import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import CaptchaEarn from './pages/CaptchaEarn';
import Wallet from './pages/Wallet';
import Profile from './pages/Profile';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Default redirect → dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Public only — redirects to /dashboard if already logged in */}
          <Route path="/login"    element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />

          {/* Protected */}
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/captcha"   element={<ProtectedRoute><CaptchaEarn /></ProtectedRoute>} />
          <Route path="/wallet"    element={<ProtectedRoute><Wallet /></ProtectedRoute>} />
          <Route path="/profile"   element={<ProtectedRoute><Profile /></ProtectedRoute>} />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
