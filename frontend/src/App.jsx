/**
 * App.jsx — Root router. Defines all routes.
 *
 * Protected routes: /captcha, /wallet — redirect to /login if not authenticated.
 * Public routes: /login, /register — redirect to /captcha if already authenticated.
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute, PublicRoute } from './components/ProtectedRoute/ProtectedRoute';

import Login from './pages/Login';
import Register from './pages/Register';
import CaptchaEarn from './pages/CaptchaEarn';
import Wallet from './pages/Wallet';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/captcha" replace />} />

          {/* Public only */}
          <Route path="/login"    element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />

          {/* Protected */}
          <Route path="/captcha" element={<ProtectedRoute><CaptchaEarn /></ProtectedRoute>} />
          <Route path="/wallet"  element={<ProtectedRoute><Wallet /></ProtectedRoute>} />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
